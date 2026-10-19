export interface QueueTrack {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  md5Checksum: string | null;
  parentDriveId: string;
  supported: boolean;
}

interface Entry {
  key: string;
  bytes: Uint8Array<ArrayBuffer> | null;
  length: number;
  complete: boolean;
  url: string | null;
  usedAt: number;
  played: boolean;
}

export const CACHE_LIMIT_BYTES = 50 * 1024 * 1024;
const PREFIX_BYTES = 512 * 1024;

function keyOf(track: QueueTrack): string {
  return `${track.id}:${track.parentDriveId}:${track.size}:${track.md5Checksum}`;
}

function audioPath(track: QueueTrack): string {
  const query = new URLSearchParams({ parent: track.parentDriveId });
  if (track.md5Checksum) query.set("revision", track.md5Checksum);
  return `/v1/preview-audio/${encodeURIComponent(track.id)}?${query}`;
}

async function readBounded(response: Response, expected: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new Error("No audio data returned.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expected) throw new Error("Audio response exceeded the requested range.");
      chunks.push(value);
      offset += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (!signal.aborted) throw error;
  }
  if (offset !== expected) {
    if (!signal.aborted) throw new Error("Audio response ended before the requested range.");
  }
  const result = new Uint8Array(offset);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.byteLength; }
  return result;
}

export class QueueCache {
  private entries = new Map<string, Entry>();
  private activeId: string | null = null;
  private epoch = 0;

  setActive(track: QueueTrack): void {
    this.activeId = track.id;
    const entry = this.entry(track);
    if (entry) { entry.played = true; entry.usedAt = Date.now(); }
    this.trim();
  }

  private entry(track: QueueTrack): Entry | null {
    const entry = this.entries.get(track.id);
    if (!entry) return null;
    if (entry.key === keyOf(track)) return entry;
    this.remove(track.id);
    return null;
  }

  getUrl(track: QueueTrack): string | null {
    return this.entry(track)?.url ?? null;
  }

  getState(track: QueueTrack): "full" | "prefix" | "none" {
    const entry = this.entry(track);
    return entry ? entry.complete ? "full" : "prefix" : "none";
  }

  get usedBytes(): number {
    let total = 0;
    for (const [id, entry] of this.entries) if (id !== this.activeId) total += entry.length;
    return total;
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.url) URL.revokeObjectURL(entry.url);
    this.entries.delete(id);
  }

  clear(): void {
    this.epoch += 1;
    for (const id of this.entries.keys()) this.remove(id);
    this.activeId = null;
  }

  private trim(): void {
    if (this.usedBytes <= CACHE_LIMIT_BYTES) return;
    const candidates = [...this.entries.entries()]
      .filter(([id]) => id !== this.activeId)
      .sort((a, b) => Number(b[1].played) - Number(a[1].played) || a[1].usedAt - b[1].usedAt);
    for (const [id] of candidates) {
      this.remove(id);
      if (this.usedBytes <= CACHE_LIMIT_BYTES) break;
    }
  }

  private makeRoom(id: string, targetBytes: number, protectedIds: Set<string>): boolean {
    if (targetBytes > CACHE_LIMIT_BYTES) return false;
    const current = this.entries.get(id);
    const needed = this.usedBytes - (id === this.activeId ? 0 : current?.length ?? 0) + targetBytes;
    if (needed <= CACHE_LIMIT_BYTES) return true;
    const candidates = [...this.entries.entries()]
      .filter(([candidateId]) => candidateId !== id && candidateId !== this.activeId && !protectedIds.has(candidateId))
      .sort((a, b) => Number(b[1].played) - Number(a[1].played) || a[1].usedAt - b[1].usedAt);
    let remaining = needed;
    for (const [candidateId, entry] of candidates) {
      this.remove(candidateId);
      remaining -= entry.length;
      if (remaining <= CACHE_LIMIT_BYTES) return true;
    }
    return false;
  }

  async warm(track: QueueTrack, wantFull: boolean, protectedIds: Set<string>, signal: AbortSignal, reserveBytes = 0): Promise<"full" | "prefix" | "skipped"> {
    const epoch = this.epoch;
    if (!track.supported || !track.md5Checksum || track.size === null || track.size < 1) return "skipped";
    const old = this.entry(track);
    if (old?.complete) return "full";
    const complete = wantFull && track.size <= CACHE_LIMIT_BYTES - reserveBytes;
    const targetBytes = complete ? track.size : Math.min(track.size, PREFIX_BYTES);
    if (old && old.length >= targetBytes) return old.complete ? "full" : "prefix";
    if (!this.makeRoom(track.id, targetBytes, protectedIds)) return "skipped";
    const start = old?.length ?? 0;
    const end = targetBytes - 1;
    const response = await fetch(audioPath(track), {
      headers: { Range: `bytes=${start}-${end}` },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    if (response.status !== 206 || response.headers.get("content-range") !== `bytes ${start}-${end}/${track.size}`) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new Error(response.status === 409 ? "File changed; scan the folder again." : "Drive did not return the requested audio range.");
    }
    const added = await readBounded(response, targetBytes - start, signal);
    if (epoch !== this.epoch) return "skipped";
    if (added.byteLength === 0) return "skipped";
    const length = start + added.byteLength;
    const finished = length === track.size;
    const bytes = new Uint8Array(length);
    if (old?.bytes) bytes.set(old.bytes);
    bytes.set(added, start);
    if (old?.url) URL.revokeObjectURL(old.url);
    const url = finished ? URL.createObjectURL(new Blob([bytes], { type: track.mimeType })) : null;
    this.entries.set(track.id, { key: keyOf(track), bytes: finished ? null : bytes, length, complete: finished, url, usedAt: Date.now(), played: old?.played ?? false });
    return finished ? "full" : "prefix";
  }
}

export { audioPath };
