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

function read(): LogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: LogEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    /* storage full / unavailable — ignore */
  }
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
  write([...read(), entry]);
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
  write([...read(), { t: new Date().toISOString(), ctx, msg: m }]);
}

export function getErrorLog(): LogEntry[] {
  return read().slice().reverse(); // newest first
}

export function clearErrorLog() {
  write([]);
}

/** Install global handlers for uncaught errors + unhandled promise rejections. */
export function installGlobalErrorLogging() {
  if ((window as any).__errLogInstalled) return;
  (window as any).__errLogInstalled = true;
  window.addEventListener("error", (ev: ErrorEvent) => {
    logError("window.onerror", ev.error || ev.message, {
      src: ev.filename,
      line: ev.lineno,
      col: ev.colno,
    });
  });
  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    logError("unhandledRejection", ev.reason);
  });
}
