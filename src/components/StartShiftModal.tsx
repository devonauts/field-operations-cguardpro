import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import {
  X, MapPin, Clock, BatteryCharging, BatteryFull, BatteryLow,
  Package, ListChecks, ShieldCheck, CheckCircle2, Circle, ArrowRight,
} from "lucide-react";
import { getBatteryStatus, BatteryStatus } from "@/lib/device";
import { parseStationSchedule, formatDays } from "@/lib/normalize";

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };

export interface ChecklistResult {
  battery: number | null;
  items: { key: string; label: string }[];
}

type Item = { key: string; label: string; desc?: string; done: boolean; icon: any };

export function StartShiftModal({
  isOpen,
  station,
  guardName,
  onClose,
  onStart,
}: {
  isOpen: boolean;
  station: any;
  guardName: string;
  onClose: () => void;
  onStart: (r: ChecklistResult) => void;
}) {
  const { t } = useTranslation();
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const schedule = useMemo(() => {
    try {
      const b = parseStationSchedule(station?.stationSchedule)[0];
      if (!b) return null;
      const days = b.days?.length ? formatDays(b.days) : b.name || "";
      const time = b.startTime && b.endTime ? `${b.startTime} – ${b.endTime}` : "";
      return [days, time].filter(Boolean).join("  ·  ") || null;
    } catch {
      return null;
    }
  }, [station]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setItems([
      { key: "station", label: t("startShift.itemStation"), desc: t("startShift.itemStationDesc"), done: false, icon: ShieldCheck },
      { key: "battery", label: t("startShift.itemBattery"), done: false, icon: BatteryFull },
      { key: "inventory", label: t("startShift.itemInventory"), desc: t("startShift.itemInventoryDesc"), done: false, icon: Package },
      { key: "tasks", label: t("startShift.itemTasks"), desc: t("startShift.itemTasksDesc"), done: false, icon: ListChecks },
    ]);
    getBatteryStatus().then((b) => {
      if (cancelled) return;
      setBattery(b);
      // auto-tick battery if charged enough or charging
      if (b.supported && (b.charging || (b.level ?? 0) >= 30)) {
        setItems((prev) => prev.map((it) => (it.key === "battery" ? { ...it, done: true } : it)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, t]);

  const toggle = (key: string) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, done: !it.done } : it)));

  const allDone = items.length > 0 && items.every((it) => it.done);

  const batteryIcon = !battery?.supported
    ? BatteryFull
    : battery.charging
    ? BatteryCharging
    : (battery.level ?? 0) < 25
    ? BatteryLow
    : BatteryFull;
  const batteryColor = !battery?.supported
    ? "text-muted"
    : battery.charging || (battery.level ?? 0) >= 30
    ? "text-online"
    : (battery.level ?? 0) < 20
    ? "text-critical"
    : "text-high";

  const start = () =>
    onStart({
      battery: battery?.supported ? battery.level : null,
      items: items.map(({ key, label }) => ({ key, label })),
    });

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <div className="flex h-full flex-col bg-background text-ink">
        {/* header */}
        <div
          className="flex items-center justify-between border-b border-line px-4 pb-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
        >
          <div>
            <p className="label-eyebrow">{t("startShift.eyebrow")}</p>
            <h2 className="text-lg font-bold">{t("startShift.title")}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted active:bg-surface-2">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* station status */}
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-soft">
                <ShieldCheck size={18} className="text-gold" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{station?.stationName || station?.name || t("startShift.station")}</p>
                <p className="text-xs text-muted">{t("startShift.statusActive")}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[13px] text-muted">
              {schedule && (
                <div className="flex items-center gap-2">
                  <Clock size={14} className="shrink-0 text-faint" />
                  <span>{schedule}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <MapPin size={14} className="shrink-0 text-faint" />
                <span>
                  {station?.latitud && station?.longitud
                    ? t("startShift.geofenceSet")
                    : t("startShift.geofenceMissing")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Component icon={batteryIcon} className={`shrink-0 ${batteryColor}`} />
                <span className={batteryColor}>
                  {battery?.supported
                    ? `${battery.level}%${battery.charging ? " · " + t("startShift.charging") : ""}`
                    : t("startShift.batteryUnknown")}
                </span>
              </div>
            </div>
          </div>

          {/* checklist */}
          <div>
            <p className="label-eyebrow mb-2.5">{t("startShift.checklist")}</p>
            <div className="space-y-2.5">
              {items.map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.key}
                    onClick={() => toggle(it.key)}
                    aria-pressed={it.done}
                    className={`flex w-full items-center gap-3.5 rounded-card border p-4 text-left transition-colors ${
                      it.done ? "border-online/50 bg-online-soft" : "border-line bg-surface active:bg-surface-2"
                    }`}
                  >
                    {/* leading icon tile */}
                    <div
                      className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                        it.done ? "bg-online/15" : "bg-surface-2"
                      }`}
                    >
                      <Icon size={22} className={it.done ? "text-online" : "text-muted"} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold leading-tight text-ink">{it.label}</p>
                      {it.desc && <p className="mt-1 text-[13px] leading-snug text-muted">{it.desc}</p>}
                    </div>
                    {/* trailing check state */}
                    {it.done ? (
                      <CheckCircle2 size={26} className="shrink-0 text-online" />
                    ) : (
                      <Circle size={26} className="shrink-0 text-faint" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="border-t border-line px-4 pt-3" style={footerStyle}>
          <button
            onClick={start}
            disabled={!allDone}
            className="btn-xl w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-40"
          >
            {t("startShift.startBtn")}
            <ArrowRight size={18} />
          </button>
          {!allDone && (
            <p className="mt-2 text-center text-xs text-faint">{t("startShift.completeAll")}</p>
          )}
        </div>
      </div>
    </IonModal>
  );
}

/** small helper so a dynamic lucide icon can be rendered with className */
function Component({ icon: Icon, className }: { icon: any; className?: string }) {
  return <Icon size={14} className={className} />;
}
