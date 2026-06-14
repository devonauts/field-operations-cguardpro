import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { CalendarDays, FileBarChart, User, ChevronRight, LogOut, Shirt, LifeBuoy } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { fb } from "@/lib/feedback";

export default function More() {
  const { t } = useTranslation();
  const history = useHistory();
  const { signOut, refreshUser } = useAuth();

  const items = [
    { icon: <CalendarDays size={20} />, label: t("nav.schedule"), to: "/supervisor/schedule" },
    { icon: <Shirt size={20} />, label: t("uniform.title"), to: "/supervisor/uniform" },
    { icon: <LifeBuoy size={20} />, label: t("backupConfirm.title"), to: "/supervisor/backup" },
    { icon: <FileBarChart size={20} />, label: t("nav.reports"), to: "/supervisor/reports" },
    { icon: <User size={20} />, label: t("nav.profile"), to: "/supervisor/profile" },
  ];

  return (
    <Screen root title={t("nav.more")} onRefresh={refreshUser}>
      <Card className="divide-y divide-line p-0">
        {items.map((it) => (
          <button
            key={it.to}
            onClick={() => {
              fb.tap();
              history.push(it.to);
            }}
            className="flex w-full items-center gap-3 px-4 py-4 text-sm font-medium text-ink active:bg-surface-2"
          >
            <span className="text-gold">{it.icon}</span>
            <span className="flex-1 text-left">{it.label}</span>
            <ChevronRight size={18} className="text-muted" />
          </button>
        ))}
      </Card>

      <Card className="mt-4 p-2">
        <button
          onClick={() => {
            fb.press();
            signOut();
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-critical active:bg-surface-2"
        >
          <LogOut size={18} />
          {t("auth.signOut")}
        </button>
      </Card>
    </Screen>
  );
}
