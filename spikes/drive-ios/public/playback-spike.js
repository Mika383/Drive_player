const $ = (id) => document.getElementById(id);
const players = [$('audio-a'), $('audio-b')];
const maxBytes = 25 * 1024 * 1024;
const logKey = 'drive-player-preload-diagnostics';
let lines = [];
let tracks = [];
let availableTracks = [];
let active = players[0];
let standby = players[1];
let activeIndex = 0;
let standbyReady = false;
let running = false;
let generation = 0;
const objectUrls = new Map();
const downloads = new Set();

try {
  const saved = JSON.parse(localStorage.getItem(logKey) || '[]');
  if (Array.isArray(saved)) lines = saved.filter((line) => typeof line === 'string').slice(-120);
} catch { /* The diagnostic log is optional. */ }

function snapshot(player) {
  const slot = player === players[0] ? 'A' : 'B';
  const time = Number.isFinite(player.currentTime) ? player.currentTime.toFixed(1) : '?';
  return `slot=${slot} t=${time} ready=${player.readyState} network=${player.networkState} ` +
    `paused=${player.paused} visible=${document.visibilityState} error=${player.error?.code || 0}`;
}

function record(event, player = active) {
  lines.push(`${new Date().toISOString()} ${event} ${snapshot(player)}`);
  lines = lines.slice(-120);
  $('log').textContent = lines.join('\n');
  try { localStorage.setItem(logKey, JSON.stringify(lines)); } catch { /* Optional local log. */ }
}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').style.color = error ? '#ff9a9a' : '#ffce8f';
}

function revokeFor(player) {
  const url = objectUrls.get(player);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(player);
}

function setMetadata(index) {
  if (!('mediaSession' in navigator)) return;
  if ('MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[index].name, artist: 'Drive Player' });
  }
}

function stop() {
  generation += 1;
  running = false;
  standbyReady = false;
  for (const controller of downloads) controller.abort();
  downloads.clear();
  for (const player of players) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    revokeFor(player);
  }
  $('start').disabled = false;
  $('stop').disabled = true;
  status('Đã dừng.');
  record('stopped');
}

async function fetchCompleteAudio(track, controller) {
  const response = await fetch(`/audio/${encodeURIComponent(track.id)}`, {
    cache: 'no-store',
    signal: controller.signal,
  });
  if (response.status !== 200 || !response.body) throw new Error('Không lấy được toàn bộ bài tiếp theo.');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body.cancel();
    throw new Error('Bài tiếp theo lớn hơn 25 MiB. Hãy chọn bài nhỏ hơn.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Bài tiếp theo lớn hơn 25 MiB. Hãy chọn bài nhỏ hơn.');
    }
    chunks.push(value);
  }
  return new Blob(chunks, { type: track.mimeType || response.headers.get('content-type') || 'audio/mpeg' });
}

function waitForCanPlay(player, currentGeneration) {
  if (player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('iPhone chưa nạp được phần tử audio trong 15 giây.')), 15000);
    function finish(error) {
      clearTimeout(timeout);
      player.removeEventListener('canplay', onReady);
      player.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    }
    function onReady() {
      finish(currentGeneration === generation ? null : new Error('Đã dừng lần thử.'));
    }
    function onError() { finish(new Error('iPhone không nạp được bài tiếp theo.')); }
    player.addEventListener('canplay', onReady);
    player.addEventListener('error', onError);
  });
}

async function prepareNext(currentGeneration, targetPlayer, targetIndex) {
  const controller = new AbortController();
  downloads.add(controller);
  record(`prefetch started index=${targetIndex}`, targetPlayer);
  try {
    const blob = await fetchCompleteAudio(tracks[targetIndex], controller);
    if (currentGeneration !== generation || !running) return;
    record(`prefetch complete bytes=${blob.size} index=${targetIndex}`, targetPlayer);
    targetPlayer.removeAttribute('src');
    targetPlayer.load();
    revokeFor(targetPlayer);
    const url = URL.createObjectURL(blob);
    objectUrls.set(targetPlayer, url);
    targetPlayer.src = url;
    targetPlayer.preload = 'auto';
    targetPlayer.load();
    await waitForCanPlay(targetPlayer, currentGeneration);
    if (currentGeneration !== generation || targetPlayer !== standby) return;
    standbyReady = true;
    record(`standby ready index=${targetIndex}`, targetPlayer);
    status('Bài sau đã tải xong và sẵn sàng. Bây giờ hãy khóa màn hình.');
  } catch (error) {
    if (currentGeneration !== generation || controller.signal.aborted) return;
    record(`prefetch failed name=${error.name}`, targetPlayer);
    status(error.message || 'Không tải sẵn được bài tiếp theo.', true);
  } finally {
    downloads.delete(controller);
  }
}

function advance() {
  if (!running) return;
  if (!standbyReady) {
    record('next blocked because standby not ready');
    status('Bài cũ đã hết trước khi bài sau sẵn sàng. Lần thử này không hợp lệ.', true);
    return;
  }
  const old = active;
  old.pause();
  active = standby;
  standby = old;
  activeIndex = (activeIndex + 1) % tracks.length;
  standbyReady = false;
  setMetadata(activeIndex);
  record(`source switched to prepared index=${activeIndex}`);
  status('Đang chuyển sang bài đã tải sẵn…');
  active.play().then(
    () => record('play resolved'),
    (error) => {
      record(`play rejected name=${error.name}`);
      status('iPhone từ chối phát bài đã tải sẵn.', true);
    },
  );
  void prepareNext(generation, standby, (activeIndex + 1) % tracks.length);
}

function start() {
  if (running) return;
  const first = Number($('first').value);
  const second = Number($('second').value);
  if (!Number.isInteger(first) || !Number.isInteger(second) || first === second) {
    status('Hãy chọn hai bài khác nhau.', true);
    return;
  }
  tracks = [availableTracks[first], availableTracks[second]];
  if (tracks.some((track) => !track)) return;
  generation += 1;
  running = true;
  standbyReady = false;
  activeIndex = 0;
  active = players[0];
  standby = players[1];
  active.src = `/audio/${encodeURIComponent(tracks[0].id)}`;
  active.load();
  setMetadata(0);
  $('start').disabled = true;
  $('stop').disabled = false;
  status('Đang phát bài đầu và tải sẵn toàn bộ bài sau…');
  record('start index=0');
  active.play().then(
    () => record('play resolved'),
    (error) => {
      record(`play rejected name=${error.name}`);
      status('Không thể bắt đầu phát. Hãy bấm Dừng rồi thử lại.', true);
    },
  );
  void prepareNext(generation, standby, 1);
}

async function loadTracks() {
  try {
    const session = await fetch('/api/session').then((response) => response.json());
    if (!session.signedIn || !session.folders) throw new Error('Hãy đăng nhập và kiểm tra thư mục ở trang chính trước.');
    const responses = await Promise.all(['/api/songs', '/api/incoming'].map((path) => fetch(path)));
    const payloads = await Promise.all(responses.map((response) => response.json()));
    if (responses.some((response) => !response.ok)) throw new Error('Không tải được danh sách bài.');
    const byId = new Map();
    for (const file of [...payloads[0].files, ...payloads[1].files]) byId.set(file.id, file);
    availableTracks = [...byId.values()];
    for (const selector of [$('first'), $('second')]) {
      selector.replaceChildren();
      availableTracks.forEach((track, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = track.name;
        selector.append(option);
      });
    }
    if (availableTracks.length < 2) throw new Error('Cần ít nhất hai bài trong thư viện hoặc thư mục chờ.');
    $('second').selectedIndex = 1;
    $('start').disabled = false;
    status('Chọn hai bài rồi bấm Phát thử.');
  } catch (error) {
    status(error.message || 'Không tải được danh sách bài.', true);
  }
}

for (const player of players) {
  for (const event of ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'pause', 'ended', 'error']) {
    player.addEventListener(event, () => record(event, player));
  }
  player.addEventListener('ended', () => { if (player === active) advance(); });
}
document.addEventListener('visibilitychange', () => record('visibilitychange'));
if ('mediaSession' in navigator) {
  for (const [action, handler] of Object.entries({ play: () => active.play(), pause: () => active.pause(), nexttrack: advance })) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Action not supported. */ }
  }
}
$('start').addEventListener('click', start);
$('stop').addEventListener('click', stop);
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    status('Đã sao chép chẩn đoán.');
  } catch { status('Không thể sao chép tự động.', true); }
});
$('log').textContent = lines.join('\n');
record(`page opened mode=${window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'}`);
void loadTracks();
