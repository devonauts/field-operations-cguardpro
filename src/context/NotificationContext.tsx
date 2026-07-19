import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { eventService, PlatformEvent } from "@/lib/services";
import { connectNotifications } from "@/lib/notificationsSocket";
import { onPush } from "@/lib/pushEvents";

/**
 * UI-facing notification shape. Flattened from the server's PlatformEvent so the
 * bell/notification center reads `read`/`type`/`data` directly without knowing
 * about deliveryStatus or the payload field name.
 */
export type AppNotification = {
  id: string;
  type: string;        // eventType
  title: string;
  body: string;
  data: Record<string, any>;   // = payload (may be undefined → default {})
  read: boolean;               // deliveryStatus === 'read' ? true : false
  createdAt: string;
};

interface NotificationContextType {
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = (): NotificationContextType => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationProvider>");
  return ctx;
};

/** Map a server PlatformEvent (REST list) → the flat UI shape. */
function fromPlatformEvent(ev: PlatformEvent): AppNotification {
  return {
    id: ev.id,
    type: ev.eventType,
    title: ev.title,
    body: ev.body,
    data: ev.payload || {},
    read: ev.deliveryStatus === "read",
    createdAt: ev.createdAt,
  };
}

/** Map a realtime/socket event (no deliveryStatus) → an unread UI notification. */
function fromRealtimeEvent(ev: PlatformEvent): AppNotification {
  return {
    id: ev.id,
    type: ev.eventType,
    title: ev.title,
    body: ev.body,
    data: ev.payload || {},
    read: false,
    createdAt: ev.createdAt || new Date().toISOString(),
  };
}

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Badge count is derived from the loaded items so it never drifts from what
  // the user actually sees in the list.
  const unreadCount = useMemo(
    () => items.filter((n) => !n.read).length,
    [items],
  );

  // Re-fetch list + unread count. The server count is fetched too, but we trust
  // the derived count for the badge so it stays consistent with the list.
  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const rows = await eventService.list(30);
      setItems(rows.map(fromPlatformEvent));
      setError(false);
    } catch (e) {
      console.warn("notifications refresh failed", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Keep a stable ref to refresh for the realtime/push subscriptions (which we
  // only want to (re)wire on auth changes, not on every refresh identity).
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Initial load + reset on sign-out.
  useEffect(() => {
    if (isAuthenticated) {
      refresh();
    } else {
      setItems([]);
      setError(false);
    }
  }, [isAuthenticated, refresh]);

  // Realtime: prepend incoming events as unread, de-duped by id.
  useEffect(() => {
    if (!isAuthenticated) return;
    const disconnect = connectNotifications((ev) => {
      setItems((prev) => {
        if (prev.some((n) => n.id === ev.id)) return prev;
        // Cap so a socket-only stream can't grow the list unbounded over a shift.
        return [fromRealtimeEvent(ev), ...prev].slice(0, 100);
      });
    });
    return disconnect;
  }, [isAuthenticated]);

  // Foreground FCM: a push may land while connected. Resync so the badge updates
  // even if the socket missed it. De-dup by id is handled by refresh replacing
  // the list, so socket + FCM never double-count the same event.
  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onPush(() => {
      // Simple debounce: collapse a burst of pushes into one refresh.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { refreshRef.current(); }, 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [isAuthenticated]);

  // Optimistic: flip read=true locally, then persist. Resync on failure.
  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await eventService.markRead(id);
    } catch (e) {
      console.warn("markRead failed, resyncing", e);
      refreshRef.current();
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await eventService.markAllRead();
    } catch (e) {
      console.warn("markAllRead failed, resyncing", e);
      refreshRef.current();
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      await eventService.remove(id);
    } catch (e) {
      console.warn("remove failed, resyncing", e);
      refreshRef.current();
    }
  }, []);

  const clearAll = useCallback(async () => {
    setItems([]);
    try {
      await eventService.clearAll();
    } catch (e) {
      console.warn("clearAll failed, resyncing", e);
      refreshRef.current();
    }
  }, []);

  const value = useMemo<NotificationContextType>(
    () => ({
      items,
      unreadCount,
      loading,
      error,
      refresh,
      markRead,
      markAllRead,
      remove,
      clearAll,
    }),
    [items, unreadCount, loading, error, refresh, markRead, markAllRead, remove, clearAll],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
