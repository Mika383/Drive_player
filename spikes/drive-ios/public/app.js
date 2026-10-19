const $ = (id) => document.getElementById(id);
const audio = $('audio');
const dialog = $('import-dialog');
let session;
let queue = [];
let currentIndex = -1;
let pendingImport;
const playbackLogKey = 'drive-player-playback-diagnostics';
let playbackLog = [];
try {
  const saved = JSON.parse(localStorage.getItem(playbackLogKey) || '[]');
  if (Array.isArray(saved)) playbackLog = saved.filter((line) => typeof line === 'string').slice(-80);
} catch { /* Diagnostics must not block playback. */ }

function playbackSnapshot() {
  return `t=${Number.isFinite(audio.currentTime) ? audio.currentTime.toFixed(1) : '?'} ` +
    `ready=${audio.readyState} network=${audio.networkState} paused=${audio.paused} ` +
    `visible=${document.visibilityState} error=${audio.error?.code || 0}`;
}

function playbackEvent(name) {
  const line = `${new Date().toISOString()} ${name} ${playbackSnapshot()}`;
  playbackLog.push(line);
  playbackLog = playbackLog.slice(-80);
  $('playback-log').textContent = playbackLog.join('\n');
  try { localStorage.setItem(playbackLogKey, JSON.stringify(playbackLog)); } catch { /* Optional local log. */ }
}

$('playback-log').textContent = playbackLog.join('\n');
playbackEvent(`page opened mode=${window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'}`);
$('copy-playback-log').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(playbackLog.join('\n'));
    status('Đã sao chép chẩn đoán.');
  } catch {
    status('Không thể sao chép tự động. Hãy chọn và sao chép phần chữ bên trên.', true);
  }
});

for (const eventName of ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'suspend', 'pause', 'ended', 'error']) {
  audio.addEventListener(eventName, () => playbackEvent(eventName));
}
document.addEventListener('visibilitychange', () => playbackEvent('visibilitychange'));

function status(message, isError = false) {
  $('status').textContent = message;
  $('status').style.color = isError ? '#ff9a9a' : '#ffce8f';
}

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function run(action, successMessage) {
  try {
    status('Đang xử lý…');
    const value = await action();
    status(successMessage || 'Hoàn tất.');
    return value;
  } catch (error) {
    status(error.message || 'Thao tác thất bại.', true);
    return null;
  }
}

function renderSession() {
  $('account').textContent = session.signedIn ? session.email : 'Chưa đăng nhập';
  $('login').hidden = session.signedIn;
  $('logout').hidden = !session.signedIn;
  $('setup').hidden = !session.signedIn;
  $('service-email').textContent = session.serviceAccountEmail;
  $('folder').textContent = session.rootId
    ? `Thư mục đã chọn: ${session.rootId} · ${session.verified ? 'đã xác nhận Editor' : 'chưa xác nhận Editor'}`
    : 'Chưa chọn thư mục.';
  $('verify-share').disabled = !session.rootId;
  $('setup-folders').disabled = !session.verified;
  $('library').hidden = !session.folders;
}

async function loadSession() {
  session = await request('/api/session');
  renderSession();
  if (session.folders) await refreshFiles();
}

async function pickerReady() {
  if (!window.gapi) {
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.gapi) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 10000) {
          clearInterval(timer);
          reject(new Error('Không tải được Google Picker. Kiểm tra kết nối mạng.'));
        }
      }, 100);
    });
  }
  await new Promise((resolve, reject) => {
    window.gapi.load('picker', { callback: resolve, onerror: reject });
  });
}

async function pickFolder() {
  const { accessToken } = await request('/api/picker-token');
  await pickerReady();
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setOwnedByMe(true)
    .setMode(google.picker.DocsViewMode.LIST);
  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(session.pickerKey)
    .setAppId(session.projectNumber)
    .setOrigin(window.location.origin)
    .setCallback(async (data) => {
      if (data.action === google.picker.Action.ERROR) {
        status('Google Picker gặp lỗi.', true);
        return;
      }
      if (data.action !== google.picker.Action.PICKED || !data.docs?.[0]?.id) return;
      const folder = await run(
        () => request('/api/select-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.docs[0].id }),
        }),
        'Đã chọn thư mục. Tiếp theo, chia sẻ thư mục cho tài khoản dịch vụ.',
      );
      if (folder) await loadSession();
    })
    .build();
  picker.setVisible(true);
}

function fileRow(file, index, files, canImport) {
  const row = document.createElement('div');
  row.className = 'item';
  const name = document.createElement('span');
  name.textContent = file.name;
  const actions = document.createElement('div');
  actions.className = 'actions';
  const playButton = document.createElement('button');
  playButton.textContent = 'Phát';
  playButton.addEventListener('click', () => play(files, index));
  actions.append(playButton);
  if (canImport) {
    const importButton = document.createElement('button');
    importButton.textContent = 'Nhập';
    importButton.addEventListener('click', () => {
      pendingImport = file;
      $('import-name').textContent = file.name;
      dialog.showModal();
    });
    actions.append(importButton);
  }
  row.append(name, actions);
  return row;
}

function renderFiles(targetId, files, canImport) {
  const target = $(targetId);
  target.replaceChildren();
  if (!files.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = canImport ? 'Chưa có nhạc trong incoming/.' : 'Chưa có bài đã nhập.';
    target.append(empty);
    return;
  }
  files.forEach((file, index) => target.append(fileRow(file, index, files, canImport)));
}

async function refreshFiles() {
  const [waiting, imported] = await Promise.all([
    request('/api/incoming'),
    request('/api/songs'),
  ]);
  renderFiles('incoming-list', waiting.files, true);
  renderFiles('songs-list', imported.files, false);
}

function updateMediaSession(file) {
  if (!('mediaSession' in navigator)) return;
  if ('MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: file.name, artist: 'Drive Player' });
  }
  navigator.mediaSession.playbackState = 'playing';
}

function play(files, index) {
  queue = files;
  currentIndex = index;
  const file = queue[index];
  if (!file) return;
  $('player').hidden = false;
  $('track-name').textContent = file.name;
  audio.src = `/audio/${encodeURIComponent(file.id)}`;
  playbackEvent(`source changed index=${index}`);
  updateMediaSession(file);
  audio.play().then(
    () => playbackEvent('play resolved'),
    (error) => {
      playbackEvent(`play rejected name=${error.name}`);
      status(`Không thể phát: ${error.message}`, true);
    },
  );
}

function next() {
  if (!queue.length) return;
  playbackEvent('next requested');
  play(queue, (currentIndex + 1) % queue.length);
}

function setupMediaActions() {
  if (!('mediaSession' in navigator)) return;
  const handlers = {
    play: () => audio.play(),
    pause: () => audio.pause(),
    nexttrack: next,
    previoustrack: () => play(queue, Math.max(0, currentIndex - 1)),
    seekto: (details) => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime; },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action on this iOS version. */ }
  }
  audio.addEventListener('play', () => { navigator.mediaSession.playbackState = 'playing'; });
  audio.addEventListener('pause', () => { navigator.mediaSession.playbackState = 'paused'; });
}

$('login').addEventListener('click', () => { window.location.href = '/login'; });
$('logout').addEventListener('click', () => run(async () => {
  await request('/logout', { method: 'POST' });
  audio.pause();
  audio.removeAttribute('src');
  queue = [];
  await loadSession();
}, 'Đã đăng xuất.'));
$('pick-folder').addEventListener('click', () => run(pickFolder, 'Đã mở Google Picker. Hãy chọn một thư mục thử nghiệm.'));
$('pick-folder-redirect').addEventListener('click', () => { window.location.href = '/pick-folder'; });
$('verify-share').addEventListener('click', () => run(async () => {
  await request('/api/verify-share', { method: 'POST' });
  await loadSession();
}, 'Tài khoản dịch vụ đã có quyền Editor.'));
$('setup-folders').addEventListener('click', () => run(async () => {
  await request('/api/setup-folders', { method: 'POST' });
  await loadSession();
}, 'Đã kiểm tra incoming/ và songs/.'));
$('refresh').addEventListener('click', () => run(refreshFiles, 'Đã quét lại thư mục.'));
$('upload').addEventListener('click', () => run(async () => {
  const file = $('upload-file').files?.[0];
  if (!file) throw new Error('Hãy chọn tệp âm thanh.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Prototype chỉ tải lên tệp tối đa 5 MB.');
  await request(`/api/upload-sample?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  await refreshFiles();
}, 'Đã tải tệp mẫu vào incoming/.'));
$('cancel-import').addEventListener('click', () => dialog.close());
$('confirm-import').addEventListener('click', () => run(async () => {
  if (!pendingImport) return;
  $('confirm-import').disabled = true;
  try {
    await request('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: pendingImport.id }),
    });
    dialog.close();
    pendingImport = null;
    await refreshFiles();
  } finally {
    $('confirm-import').disabled = false;
  }
}, 'Đã nhập bài.'));
$('next').addEventListener('click', next);
audio.addEventListener('ended', next);
audio.addEventListener('error', () => status('Phát nhạc thất bại. Kiểm tra kết nối và định dạng tệp.', true));
setupMediaActions();
if (new URLSearchParams(window.location.search).get('picker') === 'selected') {
  status('Đã chọn thư mục. Tiếp theo, kiểm tra quyền Editor.');
  window.history.replaceState(null, '', window.location.pathname);
}
loadSession().catch((error) => status(error.message || 'Không tải được trạng thái.', true));
