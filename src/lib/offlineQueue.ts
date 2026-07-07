// Generic offline mutation queue.
//
// SAFETY MODEL — why this can't double-submit:
//   Items are enqueued ONLY on a genuine network failure (device offline, or an
//   ApiError with status 0 = no response ever reached us). In that state the
//   server never received the request, so replaying it on reconnect is safe.
//   A server error (4xx/5xx) means the server DID process the request → it is
//   NEVER queued (the caller surfaces it instead). On flush, a replay that fails
//   with a server rejection is DROPPED (not re-queued) so a permanently-invalid
//   item can't poison the queue forever.
//
// This generalizes the per-feature pattern already proven in GuardPatrol's ronda
// scan queue (offline-first, in-flight-guarded flush, re-queue only failures).

import { isNetworkError } from "./api";

export interface QueuedMutation {
  id: string;        // stable unique id — dedup within a flush
  kind: string;      // which registered replayer handles it
  payload: any;      // JSON-serializable
  createdAt: number;
  label?: string;    // human label for the pending UI
}

type Replayer = (payload: any) => Promise<void>;
const replayers: Record<string, Replayer> = {};

/** Register the function that replays a queued mutation of `kind` on reconnect. */
export function registerReplayer(kind: string, fn: Replayer): void {
  replayers[kind] = fn;
}

const KEY = "offlineMutationQueue.v1";

function load(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(q: QueuedMutation[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* quota / unavailable */ }
  notify(q.length);
}

/* ---- pending-count subscription (for the StatusBanner indicator) ---- */
const subs = new Set<(n: number) => void>();
function notify(n: number): void {
  subs.forEach((cb) => { try { cb(n); } catch { /* ignore */ } });
}
export function subscribePending(cb: (n: number) => void): () => void {
  subs.add(cb);
  try { cb(load().length); } catch { /* ignore */ }
  return () => { subs.delete(cb); };
}
export function pendingCount(): number {
  return load().length;
}

function makeId(): string {
  try {
    const c = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignore */ }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Add a mutation to the queue. Returns its id. */
export function enqueue(kind: string, payload: any, label?: string): string {
  const item: QueuedMutation = { id: makeId(), kind, payload, createdAt: Date.now(), label };
  const q = load();
  q.push(item);
  save(q);
  return item.id;
}

let flushing = false;

/**
 * Replay every queued mutation once. In-flight-guarded so overlapping triggers
 * (online event + interval + manual) can't double-submit the same snapshot.
 * Network failures are re-queued; server rejections are dropped.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const q = load();
  if (!q.length) return;
  flushing = true;
  const failed: QueuedMutation[] = [];
  try {
    for (const it of q) {
      const fn = replayers[it.kind];
      if (!fn) { failed.push(it); continue; } // unknown kind (older build) — keep
      try {
        await fn(it.payload);
      } catch (e) {
        if (isNetworkError(e)) failed.push(it); // still offline → keep for next flush
        // else: server rejected it → drop (replaying can't fix an invalid mutation)
      }
    }
  } finally {
    flushing = false;
  }
  // Merge against a fresh read: drop the ids we just processed (failed ones are
  // re-queued), but keep anything enqueued while we were flushing.
  const processed = new Set(q.map((it) => it.id));
  const current = load();
  const remaining = [...failed, ...current.filter((it) => !processed.has(it.id))];
  save(remaining);
}

/**
 * Run a mutation now, or queue it if the device is offline / the request never
 * reached the server. Returns { queued } so the caller can show the right toast.
 * A SERVER error is re-thrown (the caller must surface it — it was NOT queued).
 */
export async function runOrQueue<T>(
  kind: string,
  payload: any,
  doIt: () => Promise<T>,
  label?: string,
): Promise<{ queued: boolean; result?: T }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue(kind, payload, label);
    return { queued: true };
  }
  try {
    const result = await doIt();
    return { queued: false, result };
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue(kind, payload, label);
      return { queued: true };
    }
    throw e;
  }
}

/** Read a File/Blob as a data URL (for deferring photo uploads in the queue). */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

let inited = false;
/** Wire reconnect flushing once, at app startup. */
export function initOfflineQueue(): void {
  if (inited) return;
  inited = true;
  const trigger = () => { void flush(); };
  if (typeof window !== "undefined") {
    window.addEventListener("online", trigger);
    // Backstop: some webviews miss the 'online' event after a network flap.
    window.setInterval(trigger, 30_000);
  }
  trigger(); // flush anything left from a previous session
}
