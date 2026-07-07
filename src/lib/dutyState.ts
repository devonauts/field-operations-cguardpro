/**
 * Shared on/off-duty state for the guard shell. The dashboard is the source of
 * truth (it reads isClockedIn from /guard/me) and publishes here; the tab bar
 * subscribes so operational UI (Radio, Patrol) only appears while ON DUTY. Off
 * duty the app is purely informative about the guard. Persisted to localStorage
 * so the correct state is known instantly on a cold start (before the dashboard
 * fetch returns).
 */
const KEY = "guard.onDuty";

let _onDuty = ((): boolean => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
})();

const subs = new Set<(v: boolean) => void>();

function emit(next: boolean) {
  subs.forEach((f) => { try { f(next); } catch { /* ignore */ } });
}

export function getDuty(): boolean {
  return _onDuty;
}

export function setDuty(v: boolean): void {
  const next = !!v;
  if (next === _onDuty) return;
  _onDuty = next;
  try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* ignore */ }
  emit(next);
}

/**
 * Re-read the persisted value and reconcile the in-memory singleton if it has
 * drifted (e.g. written by another PWA tab/webview, or directly in storage).
 * Note it does NOT short-circuit on equality with the persisted value the way
 * setDuty short-circuits on the in-memory value — it compares persisted→memory.
 */
function reconcileFromStorage(): void {
  let persisted: boolean;
  try { persisted = localStorage.getItem(KEY) === "1"; } catch { return; }
  if (persisted === _onDuty) return;
  _onDuty = persisted;
  emit(persisted);
}

// Keep multiple webviews/tabs (web/PWA) in sync. The 'storage' event fires in
// OTHER documents when this KEY changes; visibilitychange catches the case where
// the value changed while this document was backgrounded.
//
// Registered once via initDutyStateListeners() (called from main.tsx) behind an
// AbortController so it's idempotent and fully cleanable — no listener accumulation
// across HMR / StrictMode re-evaluation.
let _dutyListenersAbort: AbortController | null = null;

export function initDutyStateListeners(): () => void {
  if (typeof window === "undefined") return () => {};
  if (_dutyListenersAbort) return () => { _dutyListenersAbort?.abort(); _dutyListenersAbort = null; };
  const ac = new AbortController();
  _dutyListenersAbort = ac;
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) reconcileFromStorage();
  }, { signal: ac.signal });
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "visible") reconcileFromStorage();
  }, { signal: ac.signal });
  return () => { ac.abort(); _dutyListenersAbort = null; };
}

export function subscribeDuty(f: (v: boolean) => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
