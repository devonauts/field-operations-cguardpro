import { useEffect, useMemo, useRef, useState } from "react";
import { IonModal } from "@ionic/react";
import { modalEnterAnimation, modalLeaveAnimation } from "@/lib/modalAnimation";
import { useTranslation } from "react-i18next";
import { X, Loader2, Check, AlertTriangle, MapPin, Zap } from "lucide-react";
import { incidentService, incidentTypeService } from "@/lib/services";
import { useAsync } from "@/lib/useAsync";
import { Severity } from "@/lib/normalize";
import { getCurrentPosition, Coords } from "@/lib/geo";
import { usePhotoCapture, PhotoStrip } from "./photoCapture";
import { CustomSelect } from "./Select";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
// Standard security-company incident taxonomy (merged with tenant-configured types).
const INCIDENT_TYPE_KEYS = [
  "unauthorizedAccess", "perimeterBreach", "theft", "vandalism", "trespassing",
  "suspiciousPerson", "suspiciousPackage", "tailgating", "fight", "medical",
  "fire", "propertyDamage", "vehicleIncident", "lostFound", "equipmentFailure",
  "visitorOverstay", "safetyHazard", "policyViolation", "patrolNote", "other",
];
const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };
const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60";

const SEV_STYLE: Record<Severity, string> = {
  critical: "border-critical bg-critical/10 text-critical",
  high: "border-high bg-high/10 text-high",
  medium: "border-medium bg-medium/10 text-medium",
  low: "border-low bg-low/10 text-low",
};

function localNow(): string {
  // yyyy-MM-ddThh:mm for <input type="datetime-local"> in local time.
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function IncidentForm({
  isOpen,
  onClose,
  onCreated,
  asGuard = false,
  station,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  asGuard?: boolean;
  station?: any;
}) {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} enterAnimation={modalEnterAnimation} leaveAnimation={modalLeaveAnimation}>
      {isOpen && (
        <IncidentBody onClose={onClose} onCreated={onCreated} asGuard={asGuard} station={station} />
      )}
    </IonModal>
  );
}

function IncidentBody({
  onClose,
  onCreated,
  asGuard,
  station,
}: {
  onClose: () => void;
  onCreated: () => void;
  asGuard: boolean;
  station?: any;
}) {
  const { t } = useTranslation();
  const { data: types } = useAsync(() => incidentTypeService.list().catch(() => []), []);
  const { photos, addPhoto, removePhoto, Inputs } = usePhotoCapture();

  const [typeValue, setTypeValue] = useState(""); // "k:<key>" | "id:<backendId>"
  const [severity, setSeverity] = useState<Severity>("medium");
  const [subject, setSubject] = useState("");

  // Built-in taxonomy + any tenant types not already covered by it. Pure derived
  // data over [types, t] — memoized so the O(builtin*backend) dedupe scan doesn't
  // re-run on every keystroke in the form's text fields.
  const typeOptions = useMemo(() => {
    const builtinOptions = INCIDENT_TYPE_KEYS.map((k) => ({
      value: `k:${k}`,
      label: t(`incidents.types.${k}`),
    }));
    const backendExtra = (types || [])
      .filter(
        (it: any) =>
          !builtinOptions.some(
            (b) => b.label.toLowerCase() === String(it.name || it.title || "").toLowerCase()
          )
      )
      .map((it: any) => ({ value: `id:${it.id}`, label: it.name || it.title }));
    return [...builtinOptions, ...backendExtra];
  }, [types, t]);

  const onSelectType = (value: string) => {
    setTypeValue(value);
    const label = typeOptions.find((o) => o.value === value)?.label || "";
    // Pre-fill the title with the type for a faster, consistent report.
    if (label && !subject.trim()) setSubject(label);
  };

  const resolveTypeId = (): string | undefined => {
    if (typeValue.startsWith("id:")) return typeValue.slice(3);
    if (typeValue.startsWith("k:")) {
      const label = typeOptions.find((o) => o.value === typeValue)?.label || "";
      const match = (types || []).find(
        (it: any) => String(it.name || it.title || "").toLowerCase() === label.toLowerCase()
      );
      return match?.id;
    }
    return undefined;
  };
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(station?.stationName || station?.name || "");
  const [occurredAt, setOccurredAt] = useState(localNow());
  const [actionsTaken, setActionsTaken] = useState("");
  const [peopleInvolved, setPeopleInvolved] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cancel in-flight photo uploads if the form is closed/unmounted mid-submit.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // "Reporte rápido": type + photo + auto-GPS is enough to file — everything
  // else (description, people, actions, occurred-at) becomes optional.
  const [quickMode, setQuickMode] = useState(false);

  // Auto-capture GPS on open (same lib/geo helper GuardPatrol uses) so the
  // incident is geo-tagged without the guard doing anything. Best-effort: a
  // denied/timed-out fix just leaves the chip in its failed state.
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoState, setGeoState] = useState<"loading" | "ok" | "failed">("loading");
  useEffect(() => {
    let alive = true;
    getCurrentPosition()
      .then((c) => {
        if (!alive) return;
        setCoords(c);
        setGeoState("ok");
      })
      .catch(() => {
        if (alive) setGeoState("failed");
      });
    return () => {
      alive = false;
    };
  }, []);

  const captureGps = () => {
    setGeoState("loading");
    getCurrentPosition()
      .then((c) => {
        setCoords(c);
        setGeoState("ok");
      })
      .catch(() => setGeoState("failed"));
  };

  const submit = async () => {
    if (!subject.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // Upload evidence photos → descriptors (cancellable on close/unmount).
      const descriptors: any[] = [];
      for (const p of photos) {
        if (ac.signal.aborted) return;
        try {
          const up = await incidentService.uploadPhoto(p.file, ac.signal);
          descriptors.push({ ...up, new: true });
        } catch (e: any) {
          if (ac.signal.aborted || e?.name === "AbortError") return;
          /* skip a failed upload */
        }
      }
      if (ac.signal.aborted) return;
      const photoField = descriptors.length ? descriptors : undefined;

      const data: Record<string, any> = {
        subject: subject.trim(),
        title: subject.trim(),
        content: description.trim() || undefined,
        description: description.trim() || undefined,
        priority: severity,
        status: "abierto",
        location: location.trim() || undefined,
        // Geo-tag the report when a fix was captured.
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        incidentAt: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
        incidentTypeId: resolveTypeId(),
        actionsTaken: actionsTaken.trim() || undefined,
        action: actionsTaken.trim() || undefined,
        internalNotes: peopleInvolved.trim() || undefined,
        stationId: station?.id,
        postSiteId: station?.postSiteId,
        // Guard endpoint links `idPhoto`→imageUrl; admin create links `imageUrl`.
        idPhoto: photoField,
        imageUrl: photoField,
      };

      const createFn = asGuard ? incidentService.createAsGuard : incidentService.create;
      await createFn(data);
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <Inputs />
      <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
        <AlertTriangle size={18} className="text-high" />
        <h2 className="flex-1 text-base font-semibold text-ink">{t("incidents.newTitle")}</h2>
        <button onClick={onClose} className="text-muted">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-6">
        {/* --- GPS chip + quick-report toggle --- */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={captureGps}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              geoState === "ok"
                ? "border-online/40 bg-online/10 text-online"
                : geoState === "failed"
                  ? "border-critical/40 bg-critical/10 text-critical"
                  : "border-line text-muted"
            }`}
          >
            {geoState === "loading" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <MapPin size={13} />
            )}
            {geoState === "ok" && coords
              ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
              : geoState === "failed"
                ? t("incidents.gpsRetry", "GPS — reintentar")
                : t("incidents.gpsLocating", "Ubicando…")}
          </button>
          <button
            type="button"
            onClick={() => setQuickMode((q) => !q)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              quickMode ? "border-gold bg-gold/10 text-gold" : "border-line text-muted"
            }`}
          >
            <Zap size={13} />
            {t("incidents.quickReport", "Reporte rápido")}
          </button>
        </div>

        {/* --- Evidence (moved near the top) --- */}
        <Field label={t("incidents.evidence")}>
          <PhotoStrip photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
        </Field>

        {/* --- Details --- */}
        <p className="label-eyebrow">{t("incidents.detailsSection")}</p>

        <Field label={t("incidents.severityLabel")}>
          <div className="grid grid-cols-4 gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`flex min-h-[48px] items-center justify-center rounded-xl border px-1 text-xs font-semibold uppercase ${severity === s ? SEV_STYLE[s] : "border-line text-muted"}`}
              >
                {t(`incidents.severity.${s}`)}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("incidents.type")}>
          <CustomSelect
            value={typeValue}
            options={typeOptions}
            placeholder={t("incidents.selectType")}
            label={t("incidents.type")}
            onChange={onSelectType}
          />
        </Field>

        <Field label={t("incidents.titleField")}>
          <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>

        {/* The rest is optional and hidden in quick-report mode. */}
        {!quickMode && (
          <>
            <Field label={t("incidents.description")}>
              <textarea rows={4} className={`${inputCls} resize-none`} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            <div className="grid grid-cols-1 gap-3">
              <Field label={t("incidents.location")}>
                <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
              <Field label={t("incidents.occurredAt")}>
                <input type="datetime-local" className={inputCls} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              </Field>
            </div>

            {/* --- Response --- */}
            <p className="label-eyebrow pt-1">{t("incidents.responseSection")}</p>
            <Field label={t("incidents.peopleInvolved")}>
              <textarea rows={2} className={`${inputCls} resize-none`} value={peopleInvolved} onChange={(e) => setPeopleInvolved(e.target.value)} />
            </Field>
            <Field label={t("incidents.actionsTaken")}>
              <textarea rows={2} className={`${inputCls} resize-none`} value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} />
            </Field>
          </>
        )}

        {error && <p className="text-sm text-critical">{error}</p>}
      </div>

      <div className="border-t border-line px-4 pt-3" style={footerStyle}>
        <button
          onClick={submit}
          disabled={submitting || !subject.trim()}
          className="btn-xl w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} />{t("incidents.submit")}</>}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-eyebrow mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
