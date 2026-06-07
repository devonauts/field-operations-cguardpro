import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { useIonToast } from "@ionic/react";
import { Radio, Mic, Bell, AlertTriangle, ChevronRight, Wifi } from "lucide-react";
import { Screen } from "@/components/Screen";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";

export default function GuardRadio() {
  const { t } = useTranslation();
  const history = useHistory();
  const [present] = useIonToast();
  const [talking, setTalking] = useState(false);

  const { data } = useAsync(() => guardService.dashboard().catch(() => null));
  const station = data?.stations?.[0] || {};
  const channel = station.stationName || station.name || t("radio.generalChannel", "Canal general");

  const pttHint = () =>
    present({
      message: t("radio.comingSoon", "Voz en vivo próximamente. Usa las comunicaciones rápidas abajo."),
      duration: 2200,
      position: "top",
    });

  const quick = [
    {
      icon: <Bell size={20} />,
      title: t("radio.notices", "Avisos del puesto"),
      subtitle: t("radio.noticesSub", "Memos y comunicados"),
      tone: "text-gold",
      onClick: () => history.push("/guard/notices"),
    },
    {
      icon: <AlertTriangle size={20} />,
      title: t("radio.report", "Reportar incidente"),
      subtitle: t("radio.reportSub", "Novedad o emergencia"),
      tone: "text-critical",
      onClick: () => history.push("/guard/incidents"),
    },
  ];

  return (
    <Screen back title={t("nav.radio", "Radio")} subtitle={channel}>
      <div className="space-y-5">
        {/* Channel */}
        <div className="card-elev flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
            <Radio size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-eyebrow">{t("radio.channel", "Canal")}</p>
            <p className="truncate text-[15px] font-semibold text-ink">{channel}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-online/40 bg-online/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-online">
            <Wifi size={12} /> {t("radio.online", "En línea")}
          </span>
        </div>

        {/* Push-to-talk */}
        <div className="flex flex-col items-center py-4">
          <button
            onPointerDown={() => setTalking(true)}
            onPointerUp={() => setTalking(false)}
            onPointerLeave={() => setTalking(false)}
            onClick={pttHint}
            className="relative grid h-40 w-40 place-items-center rounded-full"
            aria-label={t("radio.pushToTalk", "Mantén para hablar")}
          >
            <span className={`absolute inset-0 rounded-full bg-gold/20 ${talking ? "animate-ping" : ""}`} />
            <span className="absolute inset-3 rounded-full border border-gold/30" />
            <span className="absolute inset-7 rounded-full border border-gold/40" />
            <span
              className={`relative grid h-24 w-24 place-items-center rounded-full text-navy shadow-[0_8px_40px_-8px_rgba(212,160,23,0.7)] ${
                talking ? "bg-gold-hover" : "bg-gold"
              }`}
            >
              <Mic size={40} strokeWidth={2.2} />
            </span>
          </button>
          <p className="mt-5 text-sm font-semibold text-ink">
            {talking ? t("radio.transmitting", "Transmitiendo…") : t("radio.pushToTalk", "Mantén para hablar")}
          </p>
          <p className="mt-1 text-center text-[11px] text-muted">
            {t("radio.comingSoonNote", "Voz en vivo en despliegue. Comunicaciones rápidas disponibles abajo.")}
          </p>
        </div>

        {/* Quick comms (real features) */}
        <div>
          <p className="label-eyebrow mb-2">{t("radio.quickComms", "Comunicaciones rápidas")}</p>
          <div className="card-elev divide-y divide-line overflow-hidden">
            {quick.map((q, i) => (
              <button
                key={i}
                onClick={q.onClick}
                className="pressable flex w-full items-center gap-3.5 px-4 py-3.5 text-left active:bg-white/[0.05]"
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 ${q.tone}`}>
                  {q.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{q.title}</p>
                  <p className="truncate text-xs text-muted">{q.subtitle}</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Screen>
  );
}
