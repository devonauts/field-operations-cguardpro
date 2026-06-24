import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import fb from "@/lib/feedback";
import NotificationCenter from "./NotificationCenter";

/**
 * Header bell — drops into the `right` slot of <Screen />. Mirrors the app's
 * header icon-button style (rounded, `pressable`, active tint) and overlays an
 * unread count pill driven by the notification context. Tapping opens the
 * <NotificationCenter /> sheet; open state is owned here.
 */
export default function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Notificaciones"
        onClick={() => {
          fb.tap();
          setOpen(true);
        }}
        className="pressable relative -mr-1.5 mt-0.5 shrink-0 rounded-full p-1.5 text-ink active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2"
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-critical px-1 text-xs font-bold leading-[18px] text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationCenter open={open} onClose={() => setOpen(false)} />
    </>
  );
}
