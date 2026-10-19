import { AppError } from "./errors";
import { botAccessToken, userAccessToken } from "./google";
import type { AuthSession } from "./session";

const FILES = "https://www.googleapis.com/drive/v3/files";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
const idPattern = /^[A-Za-z0-9_-]{10,}$/;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  parents?: string[];
  owners?: Array<{ emailAddress?: string }>;
  capabilities?: { canAddChildren?: boolean; canListChildren?: boolean };
}

export function validDriveId(id: string): string {
  if (!idPattern.test(id)) throw new AppError(400, "VALIDATION_ERROR", "Mã tệp Drive không hợp lệ.");
  return id;
}

async function driveJson<T>(token: string, url: URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store",
    });
  } catch {
    throw new AppError(502, "DRIVE_UNAVAILABLE", "Không kết nối được Google Drive.");
  }
  if (!response.ok) {
    const status = response.status === 403 || response.status === 404 ? 403 : 502;
    throw new AppError(status, "DRIVE_UNAVAILABLE", "Không thể truy cập thư mục Drive hoặc quyền đã thay đổi.");
  }
  return response.json() as Promise<T>;
}

export async function getDriveFile(token: string, id: string, fields: string): Promise<DriveFile> {
  const url = new URL(`${FILES}/${validDriveId(id)}`);
  url.searchParams.set("fields", fields);
  return driveJson<DriveFile>(token, url);
}

export async function listChildren(token: string, parentId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(FILES);
    url.searchParams.set("q", `'${validDriveId(parentId)}' in parents and trashed = false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size,md5Checksum,parents)");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await driveJson<{ files?: DriveFile[]; nextPageToken?: string }>(token, url);
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

export function supportedAudio(file: DriveFile): boolean {
  const name = file.name.toLowerCase();
  return (name.endsWith(".mp3") && file.mimeType === "audio/mpeg") ||
    (name.endsWith(".m4a") && ["audio/mp4", "audio/x-m4a", "audio/m4a"].includes(file.mimeType)) ||
    (name.endsWith(".aac") && ["audio/aac", "audio/x-aac"].includes(file.mimeType));
}

export async function verifyOwnedFolder(token: string, id: string, email: string): Promise<DriveFile> {
  const folder = await getDriveFile(token, id, "id,name,mimeType,owners(emailAddress),capabilities(canAddChildren)");
  if (folder.mimeType !== FOLDER_MIME || !folder.capabilities?.canAddChildren ||
      !folder.owners?.some(owner => owner.emailAddress?.toLowerCase() === email.toLowerCase())) {
    throw new AppError(403, "PERMISSION_DENIED", "Hãy chọn thư mục My Drive do bạn sở hữu và có quyền thêm tệp.");
  }
  return folder;
}

export async function verifyBotEditor(rootId: string): Promise<void> {
  const folder = await getDriveFile(await botAccessToken(), rootId,
    "id,mimeType,capabilities(canListChildren,canAddChildren)");
  if (folder.mimeType !== FOLDER_MIME || !folder.capabilities?.canListChildren || !folder.capabilities?.canAddChildren) {
    throw new AppError(403, "PERMISSION_DENIED", "Hãy chia sẻ thư mục cho tài khoản dịch vụ với quyền Editor.");
  }
}

async function createFolder(token: string, parentId: string, name: string): Promise<DriveFile> {
  const url = new URL(FILES);
  url.searchParams.set("fields", "id,name,mimeType,parents");
  return driveJson<DriveFile>(token, url, {
    method: "POST",
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [validDriveId(parentId)] }),
  });
}

export async function ensureFolders(session: AuthSession): Promise<{ incoming: string; songs: string }> {
  const library = session.user.library;
  if (!library?.verifiedAt) throw new AppError(409, "SETUP_REQUIRED", "Hãy kiểm tra quyền Editor trước.");
  await verifyBotEditor(library.rootDriveId);
  const botToken = await botAccessToken();
  const userToken = await userAccessToken(session);
  const children = await listChildren(botToken, library.rootDriveId);
  const result: { incoming?: string; songs?: string } = {};
  for (const name of ["incoming", "songs"] as const) {
    const matches = children.filter(file => file.name === name && file.mimeType === FOLDER_MIME);
    if (matches.length > 1) throw new AppError(409, "DUPLICATE_FOLDER", `Có nhiều thư mục ${name}/; hãy xử lý trên Drive trước.`);
    result[name] = matches[0]?.id ?? (await createFolder(userToken, library.rootDriveId, name)).id;
  }
  return { incoming: result.incoming!, songs: result.songs! };
}

export interface AudioCandidate extends DriveFile {
  location: "incoming" | "songs";
  parentDriveId: string;
  supported: boolean;
}

export async function scanLibrary(incomingId: string, songsId: string): Promise<AudioCandidate[]> {
  const token = await botAccessToken();
  const [incomingFiles, songContainers] = await Promise.all([
    listChildren(token, incomingId),
    listChildren(token, songsId),
  ]);
  const incoming = incomingFiles
    .filter(file => file.mimeType !== FOLDER_MIME)
    .map(file => ({ ...file, location: "incoming" as const, parentDriveId: incomingId, supported: supportedAudio(file) }));
  const containers = songContainers.filter(file => file.mimeType === FOLDER_MIME);
  const songFiles: DriveFile[][] = [];
  for (let index = 0; index < containers.length; index += 4) {
    songFiles.push(...await Promise.all(containers.slice(index, index + 4)
      .map(container => listChildren(token, container.id))));
  }
  const songs = songFiles.flatMap((children, index) => children
    .filter(file => file.mimeType.startsWith("audio/") || /\.(mp3|m4a|aac)$/i.test(file.name))
    .map(file => ({ ...file, location: "songs" as const, parentDriveId: containers[index].id, supported: supportedAudio(file) })));
  return [...incoming, ...songs];
}

export async function verifyLibraryFolders(rootId: string, incomingId: string, songsId: string): Promise<void> {
  const token = await botAccessToken();
  const [, children] = await Promise.all([verifyBotEditor(rootId), listChildren(token, rootId)]);
  for (const [id, name] of [[incomingId, "incoming"], [songsId, "songs"]]) {
    if (!children.some(file => file.id === id && file.name === name && file.mimeType === FOLDER_MIME)) {
      throw new AppError(409, "FOLDER_MOVED", `Thư mục ${name}/ đã thay đổi. Hãy thiết lập lại thư viện.`);
    }
  }
}

export async function authorizedAudio(session: AuthSession, fileId: string, parentDriveId?: string): Promise<DriveFile> {
  validDriveId(fileId);
  const library = session.user.library;
  if (!library?.verifiedAt || !library.incomingDriveId || !library.songsDriveId) {
    throw new AppError(409, "SETUP_REQUIRED", "Thư viện chưa được thiết lập.");
  }
  await verifyLibraryFolders(library.rootDriveId, library.incomingDriveId, library.songsDriveId);
  if (parentDriveId) {
    validDriveId(parentDriveId);
    const token = await botAccessToken();
    if (parentDriveId !== library.incomingDriveId) {
      const containers = await listChildren(token, library.songsDriveId);
      if (!containers.some(folder => folder.id === parentDriveId && folder.mimeType === FOLDER_MIME)) {
        throw new AppError(403, "PERMISSION_DENIED", "Thư mục bài hát không nằm trong thư viện được phép.");
      }
    }
    const children = await listChildren(token, parentDriveId);
    const file = children.find(candidate => candidate.id === fileId && supportedAudio(candidate));
    if (!file) throw new AppError(403, "PERMISSION_DENIED", "Tệp không nằm trong thư viện được phép hoặc chưa hỗ trợ.");
    return file;
  }
  const files = await scanLibrary(library.incomingDriveId, library.songsDriveId);
  const file = files.find(candidate => candidate.id === fileId && candidate.supported);
  if (!file) throw new AppError(403, "PERMISSION_DENIED", "Tệp không nằm trong thư viện được phép hoặc chưa hỗ trợ.");
  return file;
}

export async function streamFromDrive(fileId: string, range: string | null, signal: AbortSignal): Promise<Response> {
  if (range && !/^bytes=\d*-\d*$/.test(range)) throw new AppError(416, "INVALID_RANGE", "Byte range không hợp lệ.");
  let upstream: Response;
  try {
    upstream = await fetch(`${FILES}/${validDriveId(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${await botAccessToken()}`, ...(range ? { Range: range } : {}) },
      cache: "no-store",
      signal,
    });
  } catch {
    throw new AppError(502, "DRIVE_UNAVAILABLE", "Không tải được âm thanh từ Drive.");
  }
  if (![200, 206].includes(upstream.status) || !upstream.body) {
    throw new AppError(502, "DRIVE_UNAVAILABLE", "Không phát được âm thanh từ Drive.");
  }
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["content-length", "content-range"] as const) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
