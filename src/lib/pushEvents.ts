/**
 * Tiny pub/sub bridging incoming push notifications (registered in push.ts,
 * outside React) to components that need to react to them (e.g. the dashboard
 * flipping the moment an early-clock-out decision lands).
 *
 * The backend sends a `data` payload with every push — at minimum `{ type }`,
 * the dispatcher event name (e.g. "attendance.clockout_approved"). Subscribers
 * receive that raw data dict; FCM stringifies all values, so treat fields as
 * strings.
 */

export type PushData = Record<string, any>;

type Handler = (data: PushData) => void;

const handlers = new Set<Handler>();

/** Subscribe to incoming push payloads. Returns an unsubscribe fn. */
export function onPush(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** Called by the push listeners in push.ts when a notification arrives. */
export function emitPush(data: PushData | undefined | null): void {
  if (!data) return;
  for (const h of Array.from(handlers)) {
    try {
      h(data);
    } catch (e) {
      console.warn("push handler failed", e);
    }
  }
}
