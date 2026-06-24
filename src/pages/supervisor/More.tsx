import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { CalendarDays, FileBarChart, User, LogOut, Shirt, LifeBuoy } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/ui";
import { Button, MenuRow, MenuList } from "@/components/ui/kit";
import { useAuth } from "@/context/AuthContext";

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
      <MenuList>
        {items.map((it) => (
          <MenuRow
            key={it.to}
            icon={it.icon}
            tone="amber"
            title={it.label}
            onClick={() => history.push(it.to)}
          />
        ))}
      </MenuList>

      <Card className="mt-4 p-2">
        <Button variant="danger" full onClick={signOut} className="flex items-center justify-center gap-3">
          <LogOut size={18} />
          {t("auth.signOut")}
        </Button>
      </Card>
    </Screen>
  );
}
