"use client";

import { useEffect, useRef, useState } from "react";
import { audioPath, CACHE_LIMIT_BYTES, QueueCache, type QueueTrack } from "./cache";

interface ScanResult {
  status: number;
  data: { files: Array<QueueTrack & { location: "incoming" | "songs" }> } | null;
  message: string;
}

function mediaState(audio: HTMLAudioElement): string {
  const buffered = audio.buffered.length ? `${audio.buffered.start(audio.buffered.length - 1).toFixed(1)}-${audio.buffered.end(audio.buffered.length - 1).toFixed(1)}` : "none";
  return `t=${audio.currentTime.toFixed(1)} ready=${audio.readyState} network=${audio.networkState} buffered=${buffered} paused=${audio.paused} error=${audio.error?.code ?? 0}`;
}

function secondsBufferedAhead(audio: HTMLAudioElement): number {
  for (let index = 0; index < audio.buffered.length; index += 1) {
    if (audio.buffered.start(index) <= audio.currentTime && audio.currentTime <= audio.buffered.end(index)) {
      return audio.buffered.end(index) - audio.currentTime;
    }
  }
  return 0;
}

function bufferedToEnd(audio: HTMLAudioElement): boolean {
  return Number.isFinite(audio.duration) && audio.buffered.length > 0 &&
    audio.buffered.end(audio.buffered.length - 1) >= audio.duration - 0.25;
}

const START_PREFETCH_AHEAD_SECONDS = 12;
const PAUSE_PREFETCH_AHEAD_SECONDS = 4;

export default function QueueSpikeClient() {
  const [tracks, setTracks] = useState<QueueTrack[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Quét thư mục để tạo hàng chờ thử nghiệm.");
  const [standbyStatus, setStandbyStatus] = useState("Chưa có bài được chuẩn bị.");
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [cacheBytes, setCacheBytes] = useState(0);
  const players = useRef<Array<HTMLAudioElement | null>>([null, null]);
  const cache = useRef<QueueCache | null>(null);
  const tracksRef = useRef<QueueTrack[]>([]);
  const indexRef = useRef<number | null>(null);
  const slotRef = useRef<0 | 1>(0);
  const standbyIndexRef = useRef<number | null>(null);
  const standbyReadyRef = useRef(false);
  const fetchRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const warmedGenerationRef = useRef<number | null>(null);
  const clickedAtRef = useRef<number | null>(null);
  const transitionRef = useRef<{ slot: 0 | 1; startedAt: number } | null>(null);
  const positionSyncAtRef = useRef(0);
  const lastPositionRef = useRef<{ slot: 0 | 1; position: number; at: number } | null>(null);
  const moveRef = useRef<(delta: number) => void>(() => undefined);

  if (!cache.current) cache.current = new QueueCache();

  function log(event: string, slot = slotRef.current) {
    const audio = players.current[slot];
    const elapsed = clickedAtRef.current !== null && event === "playing"
      ? ` since-click=${Math.round(performance.now() - clickedAtRef.current)}ms` : "";
    if (event === "playing") clickedAtRef.current = null;
    const line = `${new Date().toISOString()} ${event}${elapsed} slot=${slot} visible=${document.visibilityState}${audio ? ` ${mediaState(audio)}` : ""}`;
    setDiagnostics(previous => [...previous.slice(-119), line]);
  }

  function cancelWarm() {
    fetchRef.current?.abort();
    warmedGenerationRef.current = null;
  }

  function clearAudio(slot: 0 | 1) {
    const audio = players.current[slot];
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function stop() {
    generationRef.current += 1;
    cancelWarm();
    clearAudio(0);
    clearAudio(1);
    cache.current?.clear();
    indexRef.current = null;
    standbyIndexRef.current = null;
    standbyReadyRef.current = false;
    transitionRef.current = null;
    lastPositionRef.current = null;
    setActiveIndex(null);
    setCacheBytes(0);
    setStandbyStatus("Chưa có bài được chuẩn bị.");
    setMessage("Đã dừng hàng chờ thử nghiệm.");
    log("stopped");
  }

  async function scan() {
    stop();
    const scanGeneration = generationRef.current;
    setLoading(true);
    try {
      const response = await fetch("/v1/library/scan", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as ScanResult;
      if (scanGeneration !== generationRef.current) return;
      if (!response.ok || !result.data) throw new Error(result.message || "Không quét được thư mục.");
      const ready = result.data.files.filter(file => file.supported);
      tracksRef.current = ready;
      setTracks(ready);
      setMessage(ready.length ? `Đã tìm thấy ${ready.length} bài có thể phát. Chọn một bài để bắt đầu hàng chờ.` : "Chưa có bài MP3/M4A/AAC có thể phát.");
    } catch (error) {
      if (scanGeneration === generationRef.current) {
        setMessage(error instanceof Error ? error.message : "Không quét được thư mục.");
      }
    } finally { setLoading(false); }
  }

  function setMetadata(track: QueueTrack) {
    if ("mediaSession" in navigator && "MediaMetadata" in window) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.name, artist: "Drive Player" });
    }
  }

  function syncMediaSession(audio: HTMLAudioElement, force = true) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
    if (!force && performance.now() - positionSyncAtRef.current < 3000) return;
    positionSyncAtRef.current = performance.now();
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    try {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          position: Math.max(0, Math.min(audio.currentTime, audio.duration)),
          playbackRate: audio.playbackRate > 0 ? audio.playbackRate : 1,
        });
      } else {
        navigator.mediaSession.setPositionState();
      }
    } catch { /* The browser may reject position updates while changing sources. */ }
  }

  function start(index: number) {
    const track = tracksRef.current[index];
    const audio = players.current[0];
    if (!track || !audio) return;
    generationRef.current += 1;
    cancelWarm();
    clearAudio(0);
    clearAudio(1);
    standbyIndexRef.current = null;
    standbyReadyRef.current = false;
    cache.current?.setActive(track);
    slotRef.current = 0;
    indexRef.current = index;
    setActiveSlot(0);
    setActiveIndex(index);
    clickedAtRef.current = performance.now();
    transitionRef.current = { slot: 0, startedAt: performance.now() };
    lastPositionRef.current = { slot: 0, position: 0, at: performance.now() };
    audio.src = cache.current?.getUrl(track) ?? audioPath(track);
    audio.preload = "auto";
    setMetadata(track);
    syncMediaSession(audio);
    setMessage("Đang phát bài được chọn. Khi bài này đệm đủ, ứng dụng sẽ chuẩn bị các bài sau.");
    setStandbyStatus(index < tracksRef.current.length - 1 ? "Chờ bài đang nghe đệm đủ để tải bài sau." : "Đây là bài cuối hàng chờ.");
    log("source changed", 0);
    void audio.play().catch(error => {
      log(`play rejected kind=${error instanceof Error ? error.name : "Unknown"}`, 0);
      setMessage("Trình duyệt chưa bắt đầu phát. Hãy bấm Play trên thanh audio.");
    });
  }

  function prepareStandby(index: number) {
    const track = tracksRef.current[index];
    const slot: 0 | 1 = slotRef.current === 0 ? 1 : 0;
    const audio = players.current[slot];
    const url = track && cache.current?.getUrl(track);
    if (!audio || !url || standbyIndexRef.current === index) return;
    clearAudio(slot);
    standbyIndexRef.current = index;
    standbyReadyRef.current = false;
    audio.src = url;
    audio.preload = "auto";
    audio.load();
    log("standby source prepared", slot);
  }

  function warmNext() {
    const index = indexRef.current;
    const current = players.current[slotRef.current];
    if (index === null || !current || current.paused || current.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA ||
      (secondsBufferedAhead(current) < START_PREFETCH_AHEAD_SECONDS && !bufferedToEnd(current)) || fetchRef.current ||
      warmedGenerationRef.current === generationRef.current) return;
    const candidates = tracksRef.current.slice(index + 1, index + 4);
    if (!candidates.length) return;
    const generation = generationRef.current;
    const controller = new AbortController();
    fetchRef.current = controller;
    warmedGenerationRef.current = generation;
    setStandbyStatus("Đang tải bài kế tiếp; hãy chờ báo sẵn sàng trước khi khóa màn hình.");
    log("prefetch started offset=1");
    void (async () => {
      try {
        for (let offset = 0; offset < candidates.length; offset += 1) {
          if (controller.signal.aborted || generation !== generationRef.current) return;
          const candidate = candidates[offset];
          const protectedIds = new Set(candidates.slice(0, offset).map(file => file.id));
          const reserveBytes = offset === 0 ? candidates.slice(1).reduce((total, file) =>
            total + Math.min(file.size ?? 512 * 1024, 512 * 1024), 0) : 0;
          const state = await cache.current!.warm(candidate, offset === 0, protectedIds, controller.signal, reserveBytes);
          if (controller.signal.aborted || generation !== generationRef.current) return;
          setCacheBytes(cache.current!.usedBytes);
          log(`prefetch ${state} offset=${offset + 1}`);
          if (offset === 0 && state === "full") {
            setStandbyStatus("Đã tải xong bài kế tiếp; đang nạp phần tử chờ.");
            prepareStandby(index + 1);
          }
          if (offset === 0 && state !== "full") {
            setStandbyStatus("Bài kế tiếp chưa có bản đầy đủ; chuyển bài khi khóa màn hình có thể bị gián đoạn.");
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          log(`prefetch failed kind=${error instanceof Error ? error.name : "Unknown"}`);
          setStandbyStatus("Không tải trước được bài kế tiếp; chuyển bài khi khóa màn hình có thể bị gián đoạn.");
          setMessage(error instanceof Error ? error.message : "Không tải trước được bài sau; bài hiện tại vẫn tiếp tục phát.");
        }
      } finally {
        if (fetchRef.current === controller) {
          fetchRef.current = null;
          if (controller.signal.aborted) {
            log("prefetch aborted");
            if (generation === generationRef.current && !standbyReadyRef.current) {
              setStandbyStatus("Tạm dừng tải trước để ưu tiên bài đang nghe.");
            }
          }
          if (controller.signal.aborted && generation === generationRef.current) warmNext();
        }
      }
    })();
  }

  function move(delta: number) {
    const currentIndex = indexRef.current;
    if (currentIndex === null) return;
    const targetIndex = currentIndex + delta;
    const track = tracksRef.current[targetIndex];
    if (!track) { setMessage(delta > 0 ? "Đã hết hàng chờ." : "Đây là bài đầu tiên."); return; }
    const oldSlot = slotRef.current;
    const newSlot: 0 | 1 = oldSlot === 0 ? 1 : 0;
    const nextAudio = players.current[newSlot];
    if (!nextAudio) return;
    generationRef.current += 1;
    cancelWarm();
    const cachedUrl = cache.current?.getUrl(track) ?? null;
    let ready = delta === 1 && standbyIndexRef.current === targetIndex && standbyReadyRef.current && cachedUrl !== null;
    if (ready && (!nextAudio.paused || nextAudio.currentTime > 0.25)) {
      nextAudio.pause();
      try { nextAudio.currentTime = 0; } catch { ready = false; }
      log("standby reset before switch", newSlot);
      if (nextAudio.currentTime > 0.25 || nextAudio.seeking || nextAudio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) ready = false;
    }
    if (!ready) {
      clearAudio(newSlot);
      nextAudio.src = cachedUrl ?? audioPath(track);
      nextAudio.preload = "auto";
    }
    clearAudio(oldSlot);
    standbyIndexRef.current = null;
    standbyReadyRef.current = false;
    cache.current?.setActive(track);
    setCacheBytes(cache.current?.usedBytes ?? 0);
    slotRef.current = newSlot;
    indexRef.current = targetIndex;
    setActiveSlot(newSlot);
    setActiveIndex(targetIndex);
    clickedAtRef.current = performance.now();
    transitionRef.current = { slot: newSlot, startedAt: performance.now() };
    lastPositionRef.current = { slot: newSlot, position: 0, at: performance.now() };
    setMetadata(track);
    syncMediaSession(nextAudio);
    log(ready ? "switched to ready standby" : cachedUrl ? "switched to cached full file" : "switched to direct stream", newSlot);
    setMessage(ready ? "Đã chuyển sang bài chuẩn bị sẵn." : cachedUrl ? "Đang phát lại bài còn trong bộ đệm." : "Bài này chưa sẵn sàng đầy đủ; đang tải để phát.");
    setStandbyStatus(targetIndex < tracksRef.current.length - 1 ? "Chờ bài đang nghe đệm đủ để chuẩn bị bài sau." : "Đây là bài cuối hàng chờ.");
    void nextAudio.play().catch(error => {
      log(`play rejected kind=${error instanceof Error ? error.name : "Unknown"}`, newSlot);
      setMessage("Trình duyệt chưa phát bài mới. Hãy mở lại app và bấm Play.");
    });
  }

  moveRef.current = move;

  function mediaEvent(slot: 0 | 1, event: string) {
    if (slot !== slotRef.current) {
      const standby = players.current[slot];
      if (standby && standbyIndexRef.current !== null && ["canplay", "playing", "timeupdate", "seeking", "seeked"].includes(event)) {
        if (!standby.paused) {
          standby.pause();
          log("unexpected standby playback paused", slot);
        }
        if (standby.currentTime > 0.25) {
          standbyReadyRef.current = false;
          try { standby.currentTime = 0; } catch { /* The direct stream remains the fallback. */ }
          log("standby position reset", slot);
          return;
        }
        if (standby.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !standby.seeking && !standbyReadyRef.current) {
          standbyReadyRef.current = true;
          setStandbyStatus("Bài kế tiếp đã sẵn sàng. Có thể khóa màn hình.");
          log("standby ready", slot);
        }
      }
      return;
    }
    if (event !== "timeupdate") log(event, slot);
    const activeAudio = players.current[slot];
    if (event === "playing" && activeAudio && transitionRef.current?.slot === slot) {
      if (performance.now() - transitionRef.current.startedAt < 5000 && activeAudio.currentTime > 1.5) {
        try { activeAudio.currentTime = 0; } catch { /* Diagnostics will show the remaining offset. */ }
        log("active start position reset", slot);
      }
      transitionRef.current = null;
    }
    if (activeAudio && ["playing", "timeupdate"].includes(event)) {
      const now = performance.now();
      const previous = lastPositionRef.current;
      if (previous?.slot === slot && !activeAudio.seeking) {
        const elapsed = (now - previous.at) / 1000;
        const change = activeAudio.currentTime - previous.position;
        if (change > elapsed + 3 || change < -3) {
          log(`position jump delta=${change.toFixed(1)}s wall=${elapsed.toFixed(1)}s`, slot);
        }
      }
      lastPositionRef.current = { slot, position: activeAudio.currentTime, at: now };
    }
    if (activeAudio && event === "seeked") {
      lastPositionRef.current = { slot, position: activeAudio.currentTime, at: performance.now() };
    }
    if (activeAudio && ["loadedmetadata", "canplay", "playing", "pause", "seeked", "timeupdate", "ended"].includes(event)) {
      syncMediaSession(activeAudio, event !== "timeupdate");
    }
    if (event === "error") setMessage("Không phát được bài này. Hãy kiểm tra định dạng hoặc quét lại thư mục Drive.");
    if (["waiting", "stalled"].includes(event)) cancelWarm();
    if (event === "timeupdate" && fetchRef.current && secondsBufferedAhead(players.current[slot]!) < PAUSE_PREFETCH_AHEAD_SECONDS &&
      !bufferedToEnd(players.current[slot]!)) {
      cancelWarm();
      log("prefetch paused for active track", slot);
    }
    if (["canplay", "playing", "progress"].includes(event)) warmNext();
    if (event === "timeupdate") warmNext();
    if (event === "ended") move(1);
  }

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["nexttrack", () => { log("media action nexttrack"); moveRef.current(1); }],
      ["previoustrack", () => { log("media action previoustrack"); moveRef.current(-1); }],
      ["play", () => {
        log("media action play");
        const audio = players.current[slotRef.current];
        if (audio) void audio.play().catch(error => log(`media action play rejected kind=${error instanceof Error ? error.name : "Unknown"}`));
      }],
      ["pause", () => { log("media action pause"); players.current[slotRef.current]?.pause(); }],
      ["seekto", details => {
        const audio = players.current[slotRef.current];
        if (!audio || !Number.isFinite(details.seekTime) || details.seekTime === undefined) return;
        audio.currentTime = Math.max(0, Math.min(details.seekTime, Number.isFinite(audio.duration) ? audio.duration : details.seekTime));
        log("media session seekto");
        syncMediaSession(audio);
      }],
    ];
    for (const [action, handler] of actions) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
    }
    return () => {
      for (const [action] of actions) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Unsupported action. */ }
      }
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      log("visibilitychange");
      if (standbyIndexRef.current !== null) log("visibilitychange standby", slotRef.current === 0 ? 1 : 0);
      const activeAudio = players.current[slotRef.current];
      if (activeAudio) syncMediaSession(activeAudio);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => () => {
    fetchRef.current?.abort();
    for (const audio of players.current) audio?.pause();
    cache.current?.clear();
  }, []);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("drive-player-session");
      channel.onmessage = event => { if (event.data === "logout") stop(); };
    } catch { /* The cache still clears when this page closes. */ }
    return () => channel?.close();
  }, []);

  const active = activeIndex === null ? null : tracks[activeIndex];
  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/">Drive Player</a><span>Thử hàng chờ</span></header>
    <section className="intro"><span className="eyebrow">Playback experiment</span><h1>Hàng chờ từ thư mục quét.</h1>
      <p>Chọn một bài để phát. Thứ tự bên dưới là hàng chờ tạm của phiên này; playlist lưu trữ sẽ được xây sau.</p></section>
    <section className="library">
      <div className="sectionHead"><h2>Bài trong thư viện</h2><button disabled={loading} onClick={() => void scan()}>{loading ? "Đang quét…" : "Quét thư mục"}</button></div>
      <p role="status">{message}</p>
      {tracks.length > 0 && <ul className="queueList">{tracks.map((track, index) => <li key={track.id}>
        <span>{index + 1}. {track.name}</span><button onClick={() => start(index)}>{activeIndex === index ? "Phát lại" : "Phát từ đây"}</button>
      </li>)}</ul>}
    </section>
    <section className="panel queueControls"><span className="eyebrow">Now playing</span><h2>{active?.name ?? "Chưa chọn bài"}</h2>
      <p role="status">{standbyStatus}</p>
      <p>Bộ đệm bài khác: {(cacheBytes / 1024 / 1024).toFixed(1)} / {(CACHE_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MiB.</p>
      <div className="queueButtons"><button disabled={activeIndex === null || activeIndex === 0} onClick={() => { log("button previous"); move(-1); }}>Bài trước</button>
        <button disabled={activeIndex === null || activeIndex >= tracks.length - 1} onClick={() => { log("button next"); move(1); }}>Bài sau</button>
        <button disabled={activeIndex === null} onClick={stop}>Dừng</button></div>
      {([0, 1] as const).map(slot => <div key={slot} className="queueAudioSlot">
        <span>{slot === activeSlot ? "Đang phát" : "Bài chuẩn bị"}</span>
        <audio ref={element => { players.current[slot] = element; }} controls={slot === activeSlot} preload="auto"
          onLoadedMetadata={() => mediaEvent(slot, "loadedmetadata")}
          onCanPlay={() => mediaEvent(slot, "canplay")} onPlaying={() => mediaEvent(slot, "playing")}
          onPause={() => mediaEvent(slot, "pause")}
          onSeeking={() => mediaEvent(slot, "seeking")} onSeeked={() => mediaEvent(slot, "seeked")}
          onProgress={() => mediaEvent(slot, "progress")} onWaiting={() => mediaEvent(slot, "waiting")}
          onTimeUpdate={() => mediaEvent(slot, "timeupdate")}
          onStalled={() => mediaEvent(slot, "stalled")} onEnded={() => mediaEvent(slot, "ended")}
          onError={() => mediaEvent(slot, "error")} />
      </div>)}
    </section>
    <details className="diagnostics"><summary>Chẩn đoán phát nhạc</summary>
      <p>Không lưu tên bài, file ID hoặc token. Nhật ký chỉ giữ trong trang đang mở.</p>
      <button onClick={() => void navigator.clipboard.writeText(diagnostics.join("\n"))}>Sao chép chẩn đoán</button>
      <pre>{diagnostics.slice(-30).join("\n")}</pre>
    </details>
  </main>;
}
