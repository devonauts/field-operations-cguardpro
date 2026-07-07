/**
 * Lightweight app-wide error log. On a phone the dev console isn't visible, so
 * we keep a ring buffer in localStorage that can be read from the Profile →
 * Diagnostics screen (and copied/shared). Also mirrors to console.
 */
export interface LogEntry {
  t: string; // ISO timestamp
  ctx: string; // where it happened
  msg: string; // message
  stack?: string;
}

const KEY = "errorLog";
const MAX = 100;
const PERSIST_DEBOUNCE_MS = 1500;

// In-memory ring buffer is the source of truth at runtime; localStorage is just
// the persistence layer (read once on init, written back throttled). This keeps
// each log call O(1) instead of re-parse + re-stringify of the whole buffer,
// which matters under an error storm (render loop → onerror → logError).
let buffer: LogEntry[] = loadFromStorage();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
// AbortControllers so listeners are registered exactly once and are fully
// removable — a boolean guard resets on HMR while `window` persists, leaking a
// duplicate visibilitychange/pagehide listener on every module re-eval.
let persistAbort: AbortController | null = null;
let errLogAbort: AbortController | null = null;

function loadFromStorage(): LogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function flushToStorage() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  try {
    localStorage.setItem(KEY, JSON.stringify(buffer));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

function schedulePersist() {
  // Flush on tab hide so we don't lose buffered entries if the throttle window
  // hasn't elapsed. Bound once, lazily.
  if (!persistAbort && typeof window !== "undefined") {
    persistAbort = new AbortController();
    const sig = persistAbort.signal;
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushToStorage();
    }, { signal: sig });
    window.addEventListener("pagehide", flushToStorage, { signal: sig });
  }
  if (persistTimer) return;
  persistTimer = setTimeout(flushToStorage, PERSIST_DEBOUNCE_MS);
}

function read(): LogEntry[] {
  return buffer;
}

function push(entry: LogEntry) {
  buffer.push(entry);
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  schedulePersist();
}

function write(entries: LogEntry[]) {
  buffer = entries.slice(-MAX);
  flushToStorage();
}

/** Record an error against a context label. Safe to call from anywhere. */
export function logError(ctx: string, err: any, extra?: Record<string, any>) {
  let msg: string;
  let stack: string | undefined;
  if (err instanceof Error) {
    msg = err.message;
    stack = err.stack;
  } else if (typeof err === "string") {
    msg = err;
  } else {
    try {
      msg = JSON.stringify(err);
    } catch {
      msg = String(err);
    }
  }
  if (extra) {
    try {
      msg += ` | ${JSON.stringify(extra)}`;
    } catch {
      /* ignore */
    }
  }
  // eslint-disable-next-line no-console
  console.error(`[${ctx}]`, err, extra ?? "");
  const entry: LogEntry = { t: new Date().toISOString(), ctx, msg, stack };
  push(entry);
  return entry;
}

/** Breadcrumb (non-error) — same buffer, so the flow is visible in Diagnostics. */
export function logInfo(ctx: string, msg: string, extra?: Record<string, any>) {
  let m = msg;
  if (extra) {
    try {
      m += ` | ${JSON.stringify(extra)}`;
    } catch {
      /* ignore */
    }
  }
  // eslint-disable-next-line no-console
  console.info(`[${ctx}]`, msg, extra ?? "");
  push({ t: new Date().toISOString(), ctx, msg: m });
}

export function getErrorLog(): LogEntry[] {
  return read().slice().reverse(); // newest first
}

export function clearErrorLog() {
  write([]);
}

/** Install global handlers for uncaught errors + unhandled promise rejections. */
export function installGlobalErrorLogging() {
  if (errLogAbort || typeof window === "undefined") return;
  errLogAbort = new AbortController();
  const sig = errLogAbort.signal;
  window.addEventListener("error", (ev: ErrorEvent) => {
    logError("window.onerror", ev.error || ev.message, {
      src: ev.filename,
      line: ev.lineno,
      col: ev.colno,
    });
  }, { signal: sig });
  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    logError("unhandledRejection", ev.reason);
  }, { signal: sig });
}

/** Tear down all global error-logging + persist listeners (HMR/teardown safety). */
export function uninstallErrorLogging() {
  errLogAbort?.abort(); errLogAbort = null;
  persistAbort?.abort(); persistAbort = null;
}
