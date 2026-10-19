"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface LibraryStatus { rootName: string; selected: boolean; verified: boolean; ready: boolean }
interface SessionStatus {
  signedIn: boolean;
  email: string | null;
  displayName: string | null;
  serviceAccountEmail: string | null;
  library: LibraryStatus | null;
}
interface AudioFile { id: string; name: string; mimeType: string; size: number | null; location: "incoming" | "songs"; parentDriveId: string; supported: boolean }
interface ApiResult<T> { status: number; data: T | null; message: string; error: { code: string } | null }
const PRELOAD_LIMIT_BYTES = 25 * 1024 * 1024;

async function request<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", credentials: "same-origin" });
  const result: ApiResult<T> = await response.json();
  if (!response.ok || result.data === null) throw new Error(result.message || "Request failed.");
  return result.data;
}

function fileSize(bytes: number | null): string {
  if (bytes === null) return "Size unknown";
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function audioState(audio: HTMLAudioElement): string {
  const ranges = Array.from({ length: audio.buffered.length }, (_, index) =>
    `${audio.buffered.start(index).toFixed(1)}-${audio.buffered.end(index).toFixed(1)}`).join(",") || "none";
  return `t=${audio.currentTime.toFixed(1)} duration=${Number.isFinite(audio.duration) ? audio.duration.toFixed(1) : "unknown"} buffered=${ranges} ready=${audio.readyState} network=${audio.networkState} paused=${audio.paused} error=${audio.error?.code ?? 0}`;
}

export default function PlayerClient() {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [active, setActive] = useState<AudioFile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState("No audio selected.");
  const [playbackEvents, setPlaybackEvents] = useState<string[]>([]);
  const [diagnosticNotice, setDiagnosticNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playRequestedAtRef = useRef<number | null>(null);

  function recordPlayback(event: string) {
    const audio = audioRef.current;
    if (!audio) return;
    const state = audioState(audio);
    const elapsed = playRequestedAtRef.current !== null && ["loadedmetadata", "canplay", "playing"].includes(event)
      ? ` since-click=${Math.round(performance.now() - playRequestedAtRef.current)}ms` : "";
    if (event === "playing") playRequestedAtRef.current = null;
    setPlaybackState(state);
    setPlaybackEvents(previous => [...previous.slice(-79), `${new Date().toISOString()} ${event}${elapsed} ${state}`]);
  }

  async function copyPlaybackDiagnostics() {
    const report = [`Drive Player audio diagnostics`, `Current: ${audioRef.current ? audioState(audioRef.current) : playbackState}`, ...playbackEvents].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setDiagnosticNotice("Diagnostics copied.");
    } catch {
      setDiagnosticNotice("Copy failed. Select the text below manually.");
    }
  }

  const refreshSession = useCallback(async () => {
    try {
      setSession(await request<SessionStatus>("/v1/session"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your session."); }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("authError")) setError("Google sign-in or folder selection did not finish. Please try again.");
    if (query.has("folderLocked")) setNotice("This account already has a music folder.");
    if (query.has("connected")) setNotice("Google account or folder connected.");
    if (query.size > 0) window.history.replaceState(null, "", window.location.pathname);
    void refreshSession();
  }, [refreshSession]);

  async function action(name: string, path: string) {
    setBusy(name); setError(null); setNotice(null);
    try {
      await request(path, "POST");
      await refreshSession();
      setNotice(name === "verify" ? "Editor access confirmed." : name === "setup" ? "Folders are ready." : "Signed out.");
      if (name === "logout") {
        setFiles([]); setActive(null); audioRef.current?.pause();
        try { const channel = new BroadcastChannel("drive-player-session"); channel.postMessage("logout"); channel.close(); } catch { /* Cross-tab cleanup is best effort. */ }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setBusy(null); }
  }

  async function scan() {
    setBusy("scan"); setError(null); setNotice(null);
    try {
      const result = await request<{ files: AudioFile[] }>("/v1/library/scan");
      setFiles(result.files);
      setNotice(`Found ${result.files.length} file${result.files.length === 1 ? "" : "s"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scan failed."); }
    finally { setBusy(null); }
  }

  function play(file: AudioFile) {
    if (!file.supported || !audioRef.current) return;
    playRequestedAtRef.current = performance.now();
    setError(null);
    setActive(file);
    audioRef.current.preload = file.size !== null && file.size <= PRELOAD_LIMIT_BYTES ? "auto" : "metadata";
    audioRef.current.src = `/v1/preview-audio/${encodeURIComponent(file.id)}?parent=${encodeURIComponent(file.parentDriveId)}`;
    recordPlayback("source changed");
    void audioRef.current.play().catch(() => setError("Tap play on the audio control to start this file."));
  }

  const incoming = files.filter(file => file.location === "incoming");
  const songs = files.filter(file => file.location === "songs");

  return <main className="shell">
    <header className="topbar">
      <div className="wordmark">Drive Player</div>
      {session?.signedIn && <button className="textButton" disabled={busy !== null} onClick={() => void action("logout", "/v1/auth/logout")}>Sign out</button>}
    </header>

    <section className="intro">
      <span className="eyebrow">Your private music space</span>
      <h1>Music from your Drive.</h1>
      <p>Choose one folder you own. Only files inside that folder can enter this player.</p>
    </section>

    {error && <div className="feedback error" role="alert">{error}</div>}
    {notice && <div className="feedback" role="status">{notice}</div>}
    {!session && !error && <p role="status">Loading…</p>}

    {session && !session.signedIn && <section className="panel setup">
      <span className="step">01 / Connect</span>
      <h2>Start with your Google account</h2>
      <p>Sign in to choose your own My Drive folder.</p>
      <a className="primaryButton" href="/v1/auth/google/start">Sign in with Google</a>
    </section>}

    {session?.signedIn && <>
      <div className="account">Signed in as <strong>{session.email}</strong></div>
      {!session.library && <section className="panel setup">
        <span className="step">02 / Select</span>
        <h2>Choose your music folder</h2>
        <p>Google opens a full page folder picker. This account can link one folder in the first version.</p>
        <a className="primaryButton" href="/v1/folders/pick">Choose folder with Google</a>
      </section>}

      {session.library && !session.library.verified && <section className="panel setup">
        <span className="step">03 / Access</span>
        <h2>{session.library.rootName}</h2>
        <p>Share this Drive folder with <strong>{session.serviceAccountEmail}</strong> as <strong>Editor</strong>, then confirm access.</p>
        <button className="primaryButton" disabled={busy !== null} onClick={() => void action("verify", "/v1/folders/verify")}>{busy === "verify" ? "Checking…" : "Confirm Editor access"}</button>
      </section>}

      {session.library?.verified && !session.library.ready && <section className="panel setup">
        <span className="step">04 / Organize</span>
        <h2>Prepare your folders</h2>
        <p>Drive Player will create or reuse <code>incoming/</code> and <code>songs/</code> inside {session.library.rootName}.</p>
        <button className="primaryButton" disabled={busy !== null} onClick={() => void action("setup", "/v1/folders/setup")}>{busy === "setup" ? "Preparing…" : "Prepare folders"}</button>
      </section>}

      {session.library?.ready && <section className="library">
        <div className="sectionHead"><div><span className="step">05 / Listen</span><h2>{session.library.rootName}</h2></div>
          <button disabled={busy !== null} onClick={() => void scan()}>{busy === "scan" ? "Scanning…" : "Scan folder"}</button></div>
        <p className="hint">Place MP3, M4A or AAC files in <code>incoming/</code> on Google Drive, then scan. Importing files comes in the next phase.</p>
        <p className="hint"><a href="/queue-spike">Thử hàng chờ và tải trước trên danh sách quét</a></p>
        {files.length === 0 && <div className="empty">No files shown yet. Add music to <code>incoming/</code> and select “Scan folder”.</div>}
        {([ ["Ready to review", incoming], ["Organized songs", songs] ] as const).map(([title, list]) => list.length > 0 &&
          <div className="fileGroup" key={title}><h3>{title}</h3><ul>{list.map(file => <li key={file.id}>
            <div className="fileMeta"><strong>{file.name}</strong><span>{fileSize(file.size)} · {file.supported ? "Playable" : "Format not supported yet"}</span></div>
            <button disabled={!file.supported} onClick={() => play(file)}>Play</button>
          </li>)}</ul></div>)}
      </section>}
    </>}

    {session?.library?.ready && <details className="diagnostics">
      <summary>Chẩn đoán phát nhạc</summary>
      <p>Không chứa tên bài, mã tệp hoặc token. Mở mục này sau khi bài đứng để xem phần đã tải.</p>
      <div className="diagnosticActions"><button onClick={() => void copyPlaybackDiagnostics()}>Sao chép chẩn đoán</button><span role="status">{diagnosticNotice}</span></div>
      <pre>{playbackState}{"\n"}{playbackEvents.slice(-20).join("\n")}</pre>
    </details>}

    <aside className="player" aria-label="Music player">
      <div><span className="eyebrow">Now playing</span><strong>{active?.name ?? "Choose a song"}</strong></div>
      <audio ref={audioRef} controls preload={active?.size !== null && active?.size !== undefined && active.size <= PRELOAD_LIMIT_BYTES ? "auto" : "metadata"}
        onTimeUpdate={() => { if (audioRef.current) setPlaybackState(audioState(audioRef.current)); }}
        onLoadStart={() => recordPlayback("loadstart")}
        onLoadedMetadata={() => recordPlayback("loadedmetadata")}
        onProgress={() => recordPlayback("progress")}
        onCanPlay={() => recordPlayback("canplay")}
        onPlaying={() => recordPlayback("playing")}
        onWaiting={() => recordPlayback("waiting")}
        onStalled={() => recordPlayback("stalled")}
        onSuspend={() => recordPlayback("suspend")}
        onSeeking={() => recordPlayback("seeking")}
        onSeeked={() => recordPlayback("seeked")}
        onEnded={() => recordPlayback("ended")}
        onError={() => { recordPlayback("error"); setError("Playback failed. Check the file format and Drive access."); }} />
    </aside>
  </main>;
}
