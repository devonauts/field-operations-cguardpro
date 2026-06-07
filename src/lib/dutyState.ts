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

export function getDuty(): boolean {
  return _onDuty;
}

export function setDuty(v: boolean): void {
  const next = !!v;
  if (next === _onDuty) return;
  _onDuty = next;
  try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* ignore */ }
  subs.forEach((f) => { try { f(next); } catch { /* ignore */ } });
}

export function subscribeDuty(f: (v: boolean) => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
