/**
 * Android hardware-back coordination. Capacitor fires ONE global `backButton`
 * event (App.tsx listens); raw `window.history.back()` pops CHRONOLOGICAL
 * entries, which crosses tab stacks (back from a message thread landed on the
 * previously visited tab instead of the thread list) and silently dismisses
 * dirty forms.
 *
 * Screens/components that need smarter behavior push a handler here; the last
 * pushed handler gets first refusal. A handler returns true when it consumed
 * the press (navigated somewhere itself / showed a discard-confirm), false to
 * pass to the next one. If none consumes it, App.tsx runs the default
 * (history.back() or minimize).
 */
export type BackHandler = (canGoBack: boolean) => boolean;

const handlers: BackHandler[] = [];

/** Register a handler; returns its unregister function (call on unmount). */
export function pushBackHandler(h: BackHandler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.indexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Run the chain (newest first); falls back when nobody consumes the press. */
export function runBackChain(canGoBack: boolean, fallback: () => void): void {
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      if (handlers[i](canGoBack)) return;
    } catch {
      /* a broken handler must never eat the back button */
    }
  }
  fallback();
}
