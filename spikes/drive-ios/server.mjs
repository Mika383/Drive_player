import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const required = [
  'BASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_API_KEY',
  'GOOGLE_PROJECT_NUMBER',
  'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(', ')}`);
}

const baseUrl = new URL(process.env.BASE_URL);
const port = Number(process.env.PORT || 8765);
const credentialPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
if (!isAbsolute(credentialPath)) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE must be an absolute path');
}
const resolvedCredentialPath = realpathSync(credentialPath);
const credentialRelativePath = relative(repoRoot, resolvedCredentialPath);
if (credentialRelativePath === '' ||
    (!credentialRelativePath.startsWith('..') && !isAbsolute(credentialRelativePath))) {
  throw new Error('The service-account key must be stored outside the repository');
}
const serviceAccountEmail = JSON.parse(readFileSync(resolvedCredentialPath, 'utf8')).client_email;
if (!serviceAccountEmail) {
  throw new Error('Service-account key has no client_email');
}

const oauth = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  new URL('/oauth/callback', baseUrl).href,
);
const serviceAuth = new GoogleAuth({
  keyFile: resolvedCredentialPath,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const pendingLogins = new Map();
const pendingPicks = new Map();
const sessions = new Map();
const folderMime = 'application/vnd.google-apps.folder';
const driveFileScope = 'https://www.googleapis.com/auth/drive.file';
const driveBase = 'https://www.googleapis.com/drive/v3/files';
const fileIdPattern = /^[A-Za-z0-9_-]{10,}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cookie(req, name) {
  const match = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function setCookie(res, name, value, maxAge) {
  const secure = baseUrl.protocol === 'https:' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function requireSession(req) {
  const session = sessions.get(cookie(req, 'spike_session'));
  if (!session) throw new HttpError(401, 'Hãy đăng nhập lại.');
  return session;
}

function requireSelectedFolder(session) {
  if (!session.rootId) throw new HttpError(409, 'Hãy chọn thư mục Drive trước.');
}

function requireVerifiedFolder(session) {
  requireSelectedFolder(session);
  if (!session.verified) throw new HttpError(409, 'Hãy chia sẻ thư mục cho tài khoản dịch vụ và kiểm tra quyền.');
}

function requireSetup(session) {
  requireVerifiedFolder(session);
  if (!session.folders) throw new HttpError(409, 'Hãy tạo hoặc kiểm tra incoming/ và songs/.');
}

function validateFileId(value) {
  if (typeof value !== 'string' || !fileIdPattern.test(value)) {
    throw new HttpError(400, 'Mã tệp hoặc thư mục không hợp lệ.');
  }
  return value;
}

async function readBody(req, limit = 32768) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new HttpError(413, 'Tệp hoặc dữ liệu gửi lên quá lớn.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON không hợp lệ.');
  }
}

async function userToken(session) {
  session.oauth.setCredentials(session.tokens);
  const result = await session.oauth.getAccessToken();
  if (!result.token) throw new HttpError(401, 'Quyền Google đã hết hạn. Hãy đăng nhập lại.');
  return result.token;
}

async function serviceToken() {
  const client = await serviceAuth.getClient();
  const result = await client.getAccessToken();
  if (!result.token) throw new HttpError(502, 'Không lấy được quyền tài khoản dịch vụ.');
  return result.token;
}

async function driveRequest(token, method, url, body, contentType = 'application/json') {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': contentType }),
    },
    body: body === undefined ? undefined : body,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = detail?.error?.message || response.statusText;
    throw new HttpError(response.status, `Google Drive ${response.status}: ${message}`);
  }
  return response.json();
}

async function driveGet(token, fileId, fields) {
  const url = new URL(`${driveBase}/${validateFileId(fileId)}`);
  url.searchParams.set('fields', fields);
  return driveRequest(token, 'GET', url);
}

async function listChildren(token, parentId) {
  const items = [];
  let pageToken;
  do {
    const url = new URL(driveBase);
    url.searchParams.set('q', `'${validateFileId(parentId)}' in parents and trashed = false`);
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,parents)');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await driveRequest(token, 'GET', url);
    items.push(...(page.files || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

async function createFolder(userAccessToken, parentId, name) {
  const body = JSON.stringify({ name, mimeType: folderMime, parents: [validateFileId(parentId)] });
  return driveRequest(userAccessToken, 'POST', `${driveBase}?fields=id,name,parents`, body);
}

function isAudio(file) {
  return file.mimeType?.startsWith('audio/') || /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(file.name || '');
}

async function setupFolders(session) {
  const botToken = await serviceToken();
  const userAccessToken = await userToken(session);
  const existing = await listChildren(botToken, session.rootId);
  const found = {};
  for (const name of ['incoming', 'songs']) {
    const matches = existing.filter((file) => file.name === name && file.mimeType === folderMime);
    if (matches.length > 1) throw new HttpError(409, `Có nhiều thư mục ${name}/. Hãy xử lý trùng tên trên Drive trước.`);
    found[name] = matches[0] || await createFolder(userAccessToken, session.rootId, name);
  }
  session.folders = { incoming: found.incoming.id, songs: found.songs.id };
  return session.folders;
}

async function incoming(session) {
  const files = (await listChildren(await serviceToken(), session.folders.incoming)).filter(isAudio);
  for (const file of files) session.audioCandidates.set(file.id, session.folders.incoming);
  return files;
}

async function songs(session) {
  const botToken = await serviceToken();
  const containers = (await listChildren(botToken, session.folders.songs))
    .filter((file) => file.mimeType === folderMime);
  const tracks = [];
  for (const container of containers.slice(0, 100)) {
    for (const file of (await listChildren(botToken, container.id)).filter(isAudio)) {
      session.audioCandidates.set(file.id, container.id);
      tracks.push(file);
    }
  }
  return tracks;
}

async function importFile(session, fileId) {
  const botToken = await serviceToken();
  const available = await listChildren(botToken, session.folders.incoming);
  const selected = available.find((file) => file.id === fileId && isAudio(file));
  if (!selected) throw new HttpError(404, 'Bài hát không còn trong incoming/.');
  const container = await createFolder(await userToken(session), session.folders.songs, randomUUID());
  const url = new URL(`${driveBase}/${fileId}`);
  url.searchParams.set('addParents', container.id);
  url.searchParams.set('removeParents', session.folders.incoming);
  url.searchParams.set('fields', 'id,name,parents');
  const moved = await driveRequest(botToken, 'PATCH', url, JSON.stringify({}));
  session.audioCandidates.set(fileId, container.id);
  return moved;
}

async function uploadSample(session, req, url) {
  const name = url.searchParams.get('name');
  const mimeType = req.headers['content-type'] || 'application/octet-stream';
  if (!name || name.length > 200 || !isAudio({ name, mimeType }) ||
      !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) {
    throw new HttpError(400, 'Chọn một tệp âm thanh hợp lệ.');
  }
  const audio = await readBody(req, 5 * 1024 * 1024);
  const boundary = `drive-player-${randomBytes(12).toString('hex')}`;
  const metadata = JSON.stringify({ name, mimeType, parents: [session.folders.incoming] });
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    audio,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return driveRequest(
    await userToken(session),
    'POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents',
    payload,
    `multipart/related; boundary=${boundary}`,
  );
}

async function streamAudio(session, fileId, req, res) {
  const parentId = session.audioCandidates.get(fileId);
  if (!parentId) throw new HttpError(403, 'Tệp này chưa được liệt kê trong thư viện đã chọn.');
  const botToken = await serviceToken();
  if (parentId !== session.folders.incoming) {
    const containers = await listChildren(botToken, session.folders.songs);
    if (!containers.some((folder) => folder.id === parentId && folder.mimeType === folderMime)) {
      throw new HttpError(403, 'Bài hát không còn trong thư viện.');
    }
  }
  const currentFiles = await listChildren(botToken, parentId);
  if (!currentFiles.some((file) => file.id === fileId && isAudio(file))) {
    throw new HttpError(403, 'Bài hát đã chuyển khỏi thư mục được phép.');
  }
  const range = req.headers.range;
  if (range && !/^bytes=\d*-\d*$/.test(range)) throw new HttpError(416, 'Byte range không hợp lệ.');
  const upstream = await fetch(`${driveBase}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${botToken}`, ...(range ? { Range: range } : {}) },
  });
  if (!upstream.ok || !upstream.body) {
    throw new HttpError(upstream.status, `Không thể phát tệp từ Drive (${upstream.status}).`);
  }
  const headers = {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (upstream.headers.has('content-length')) headers['Content-Length'] = upstream.headers.get('content-length');
  if (upstream.headers.has('content-range')) headers['Content-Range'] = upstream.headers.get('content-range');
  res.writeHead(upstream.status, headers);
  await pipeline(Readable.fromWeb(upstream.body), res);
}

async function selectUserFolder(session, folderId, token) {
  const folder = await driveGet(
    token, validateFileId(folderId),
    'id,name,mimeType,owners(emailAddress),capabilities(canAddChildren)',
  );
  if (folder.mimeType !== folderMime || !folder.capabilities?.canAddChildren ||
      !folder.owners?.some((owner) => owner.emailAddress?.toLowerCase() === session.email.toLowerCase())) {
    throw new HttpError(403, 'Hãy chọn thư mục My Drive do chính bạn sở hữu và có quyền thêm tệp.');
  }
  session.rootId = folder.id;
  session.verified = false;
  session.folders = null;
  session.audioCandidates.clear();
  return { id: folder.id, name: folder.name };
}

async function staticFile(res, pathname) {
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/playback-spike': ['playback-spike.html', 'text/html; charset=utf-8'],
    '/playback-spike.js': ['playback-spike.js', 'text/javascript; charset=utf-8'],
    '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
    '/icon.svg': ['icon.svg', 'image/svg+xml'],
  };
  const entry = files[pathname];
  if (!entry) throw new HttpError(404, 'Không tìm thấy trang.');
  const content = readFileSync(join(here, 'public', entry[0]));
  res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(content);
}

async function handle(req, res) {
  const url = new URL(req.url, baseUrl);
  if (req.method === 'POST' && req.headers.origin && req.headers.origin !== baseUrl.origin) {
    throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.');
  }
  if (req.method === 'GET' && url.pathname === '/login') {
    const state = randomBytes(24).toString('base64url');
    pendingLogins.set(state, Date.now() + 5 * 60 * 1000);
    setCookie(res, 'spike_state', state, 300);
    return redirect(res, oauth.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile', driveFileScope],
      state,
    }));
  }
  if (req.method === 'GET' && url.pathname === '/pick-folder') {
    const sessionId = cookie(req, 'spike_session');
    const session = requireSession(req);
    const state = randomBytes(24).toString('base64url');
    pendingPicks.set(state, { sessionId, expiry: Date.now() + 5 * 60 * 1000 });
    setCookie(res, 'spike_picker_state', state, 300);
    return redirect(res, oauth.generateAuthUrl({
      access_type: 'online',
      scope: [driveFileScope],
      include_granted_scopes: 'false',
      prompt: 'consent',
      trigger_onepick: 'true',
      allow_folder_selection: 'true',
      mimetypes: folderMime,
      login_hint: session.email,
      state,
    }));
  }
  if (req.method === 'GET' && url.pathname === '/oauth/callback') {
    const state = url.searchParams.get('state');
    const pendingPick = pendingPicks.get(state);
    if (pendingPick) {
      pendingPicks.delete(state);
      const sessionId = cookie(req, 'spike_session');
      const session = sessions.get(sessionId);
      if (!session || sessionId !== pendingPick.sessionId ||
          pendingPick.expiry < Date.now() || state !== cookie(req, 'spike_picker_state')) {
        throw new HttpError(403, 'Phiên chọn thư mục không hợp lệ.');
      }
      const providerError = url.searchParams.get('error');
      if (providerError) {
        const code = /^[a-z_]{1,50}$/.test(providerError) ? providerError : 'unknown';
        throw new HttpError(400, `Google Picker báo lỗi: ${code}.`);
      }
      const pickedIds = url.searchParams.getAll('picked_file_ids');
      if (pickedIds.length !== 1 || pickedIds[0].split(',').length !== 1) {
        throw new HttpError(400, 'Google Picker phải trả về đúng một thư mục.');
      }
      const folderId = validateFileId(pickedIds[0]);
      const code = url.searchParams.get('code');
      if (!code) throw new HttpError(400, 'Google không trả mã xác thực cho thư mục.');
      const { tokens } = await oauth.getToken(code);
      if (!tokens.access_token) throw new HttpError(401, 'Google không trả quyền truy cập thư mục.');
      const grantedScopes = new Set((tokens.scope || '').split(/\s+/).filter(Boolean));
      if (grantedScopes.size !== 1 || !grantedScopes.has(driveFileScope)) {
        throw new HttpError(403, 'Quyền Google trả về khác drive.file.');
      }
      const about = await driveRequest(
        tokens.access_token, 'GET',
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
      );
      if (about.user?.emailAddress?.toLowerCase() !== session.email.toLowerCase()) {
        throw new HttpError(403, 'Tài khoản Google chọn thư mục khác tài khoản đã đăng nhập.');
      }
      await selectUserFolder(session, folderId, tokens.access_token);
      session.tokens = tokens;
      return redirect(res, '/?picker=selected');
    }
    const expiry = pendingLogins.get(state);
    pendingLogins.delete(state);
    if (!expiry || expiry < Date.now() || state !== cookie(req, 'spike_state')) {
      throw new HttpError(403, 'Phiên đăng nhập không hợp lệ.');
    }
    const code = url.searchParams.get('code');
    if (!code) throw new HttpError(400, 'Google không trả mã xác thực.');
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) throw new HttpError(401, 'Google không trả thông tin tài khoản.');
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || !payload?.email) throw new HttpError(401, 'Email Google chưa được xác minh.');
    const sessionId = randomBytes(32).toString('base64url');
    sessions.set(sessionId, {
      email: payload.email,
      tokens,
      oauth: new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
      audioCandidates: new Map(),
    });
    setCookie(res, 'spike_session', sessionId, 3600);
    return redirect(res, '/');
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    const session = sessions.get(cookie(req, 'spike_session'));
    return json(res, 200, {
      signedIn: Boolean(session),
      email: session?.email || null,
      rootId: session?.rootId || null,
      verified: Boolean(session?.verified),
      folders: session?.folders || null,
      serviceAccountEmail,
      pickerKey: session ? process.env.GOOGLE_API_KEY : null,
      projectNumber: session ? process.env.GOOGLE_PROJECT_NUMBER : null,
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/picker-token') {
    return json(res, 200, { accessToken: await userToken(requireSession(req)) });
  }
  if (req.method === 'POST' && url.pathname === '/api/select-folder') {
    const session = requireSession(req);
    const { id } = await readJson(req);
    return json(res, 200, await selectUserFolder(session, id, await userToken(session)));
  }
  if (req.method === 'POST' && url.pathname === '/api/verify-share') {
    const session = requireSession(req);
    requireSelectedFolder(session);
    const folder = await driveGet(
      await serviceToken(), session.rootId,
      'id,name,mimeType,capabilities(canListChildren,canAddChildren)',
    );
    if (folder.mimeType !== folderMime || !folder.capabilities?.canListChildren || !folder.capabilities?.canAddChildren) {
      throw new HttpError(403, 'Tài khoản dịch vụ chưa có quyền Editor trên thư mục này.');
    }
    session.verified = true;
    return json(res, 200, { id: folder.id, name: folder.name });
  }
  if (req.method === 'POST' && url.pathname === '/api/setup-folders') {
    const session = requireSession(req);
    requireVerifiedFolder(session);
    return json(res, 200, await setupFolders(session));
  }
  if (req.method === 'GET' && url.pathname === '/api/incoming') {
    const session = requireSession(req);
    requireSetup(session);
    return json(res, 200, { files: await incoming(session) });
  }
  if (req.method === 'GET' && url.pathname === '/api/songs') {
    const session = requireSession(req);
    requireSetup(session);
    return json(res, 200, { files: await songs(session) });
  }
  if (req.method === 'POST' && url.pathname === '/api/import') {
    const session = requireSession(req);
    requireSetup(session);
    const { fileId } = await readJson(req);
    return json(res, 200, await importFile(session, validateFileId(fileId)));
  }
  if (req.method === 'POST' && url.pathname === '/api/upload-sample') {
    const session = requireSession(req);
    requireSetup(session);
    return json(res, 200, await uploadSample(session, req, url));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/audio/')) {
    const session = requireSession(req);
    requireSetup(session);
    return streamAudio(session, validateFileId(url.pathname.slice('/audio/'.length)), req, res);
  }
  if (req.method === 'POST' && url.pathname === '/logout') {
    sessions.delete(cookie(req, 'spike_session'));
    setCookie(res, 'spike_session', '', 0);
    return json(res, 200, { signedIn: false });
  }
  if (req.method === 'GET') return staticFile(res, url.pathname);
  throw new HttpError(404, 'Không tìm thấy thao tác.');
}

createServer((req, res) => {
  handle(req, res).catch((error) => {
    process.stderr.write(`Prototype request failed: ${error instanceof HttpError ? error.status : error.name}\n`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = error instanceof HttpError && error.status >= 400 && error.status <= 599 ? error.status : 500;
    json(res, status, { error: status === 500 ? 'Lỗi prototype. Kiểm tra cấu hình hoặc thử lại.' : error.message });
  });
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Drive/iPhone prototype listening at ${baseUrl.origin}\n`);
});
