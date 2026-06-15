import { useRef, useState } from "react";
import { IonModal } from "@ionic/react";
import { useTranslation } from "react-i18next";
import {
  X,
  UserPlus,
  LogOut,
  Users,
  Loader2,
  Camera,
  Images,
  ScanLine,
  ArrowLeft,
  RotateCcw,
  Check,
  User,
  Car,
  ChevronRight,
  Hash,
  Plus,
  ArrowRight,
} from "lucide-react";
import { visitorService, VisitorPhoto } from "@/lib/services";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { useAsync } from "@/lib/useAsync";
import { fmtTime } from "@/lib/format";
import { Loader } from "./ui";
import { compressImage, takeNativePhoto, isNative, CapturedImage } from "@/lib/capture";
import { scanId } from "@/lib/ocr";

type Mode = "list" | "choose" | "capture" | "form" | "vehicle";
const ID_TYPES = ["cedula", "passport", "license", "other"] as const;
const VEHICLE_TYPES = ["car", "motorcycle", "van", "truck", "other"] as const;
const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };
const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60";

interface Fields {
  idType: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string;
  expiryDate: string;
  phone: string;
  reason: string;
  personVisited: string;
  company: string;
  vehiclePlate: string;
  numPeople: number;
  tagNumber: string;
}
const EMPTY: Fields = {
  idType: "cedula",
  firstName: "",
  lastName: "",
  idNumber: "",
  birthDate: "",
  expiryDate: "",
  phone: "",
  reason: "",
  personVisited: "",
  company: "",
  vehiclePlate: "",
  numPeople: 1,
  tagNumber: "",
};

async function uploadAll(photos: CapturedImage[]): Promise<any[] | undefined> {
  const out: any[] = [];
  for (const p of photos) {
    try {
      const up: VisitorPhoto = await visitorService.uploadPhoto(p.file);
      out.push({ ...up, new: true });
    } catch {
      /* skip a failed upload, keep the rest */
    }
  }
  return out.length ? out : undefined;
}

export function VisitorModal({
  isOpen,
  onClose,
  station,
}: {
  isOpen: boolean;
  onClose: () => void;
  station: any;
}) {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      {isOpen && <VisitorFlow station={station} onClose={onClose} />}
    </IonModal>
  );
}

export function VisitorFlow({ station, onClose, embedded }: { station: any; onClose: () => void; embedded?: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("list");
  const [photos, setPhotos] = useState<CapturedImage[]>([]);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [scanFailed, setScanFailed] = useState(false);

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const webResolver = useRef<((img: CapturedImage | null) => void) | null>(null);
  // Bumped on every new scan / reset so a slow OCR result can be discarded if the
  // flow has moved on (e.g. modal closed → flow unmounted) before it resolves.
  const scanGen = useRef(0);

  const { data, loading, reload } = useAsync(() =>
    visitorService.list({ limit: 50 }).catch(() => [])
  );
  const visits = (data || []).filter((v: any) =>
    station?.id ? v.stationId === station.id || !v.stationId : true
  );

  const capture = (source: "camera" | "gallery"): Promise<CapturedImage | null> => {
    if (isNative()) return takeNativePhoto(source).catch(() => null);
    return new Promise((resolve) => {
      webResolver.current = resolve;
      (source === "camera" ? cameraInput : galleryInput).current?.click();
    });
  };
  const onWebPick = async (file?: File | null) => {
    const r = webResolver.current;
    webResolver.current = null;
    if (!file) return r?.(null);
    try {
      r?.(await compressImage(file));
    } catch {
      r?.(null);
    }
  };

  const runScan = async (img: CapturedImage) => {
    const gen = ++scanGen.current;
    const stale = () => gen !== scanGen.current;
    setScanProgress(0);
    setScanFailed(false);
    try {
      const res = await scanId(img.dataUrl, (p) => {
        if (!stale()) setScanProgress(Math.round(p * 100));
      });
      if (stale()) return;
      setFields((f) => ({
        ...f,
        idNumber: f.idNumber || res.idNumber || "",
        firstName: f.firstName || res.firstName || "",
        lastName: f.lastName || res.lastName || "",
        birthDate: f.birthDate || res.birthDate || "",
        expiryDate: f.expiryDate || res.expiryDate || "",
      }));
      if (!res.idNumber && !res.firstName && !res.lastName) setScanFailed(true);
    } catch {
      if (!stale()) setScanFailed(true);
    } finally {
      if (!stale()) setScanProgress(null);
    }
  };

  // ID capture (person): photo[0] + OCR.
  const pickIdPhoto = async (source: "camera" | "gallery") => {
    const img = await capture(source);
    if (!img) return;
    setPhotos((p) => (p.length ? [img, ...p.slice(1)] : [img]));
    runScan(img);
  };
  // Add an extra visit photo (forms).
  const addPhoto = async (source: "camera" | "gallery") => {
    const img = await capture(source);
    if (img) setPhotos((p) => [...p, img]);
  };
  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const reset = () => {
    scanGen.current++; // invalidate any in-flight OCR scan
    setPhotos([]);
    setFields(EMPTY);
    setScanFailed(false);
    setScanProgress(null);
  };

  const headerTitle =
    mode === "list"
      ? t("visitor.title")
      : mode === "choose"
        ? t("visitor.register")
        : mode === "vehicle"
          ? t("visitor.modeVehicle")
          : mode === "capture"
            ? t("visitor.step1")
            : t("visitor.step2");

  const goBack = () => {
    if (mode === "form") setMode("capture");
    else if (mode === "capture" || mode === "vehicle") setMode("choose");
    else setMode("list");
  };

  return (
    <div className="flex h-full flex-col bg-navy">
      <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
        {mode === "list" ? (
          <Users size={18} className="text-gold" />
        ) : (
          <button onClick={goBack} className="text-muted">
            <ArrowLeft size={20} />
          </button>
        )}
        <h2 className="flex-1 text-base font-semibold text-ink">{headerTitle}</h2>
        {!embedded && (
          <button onClick={onClose} className="text-muted">
            <X size={22} />
          </button>
        )}
      </div>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onWebPick(e.target.files?.[0])} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => onWebPick(e.target.files?.[0])} />

      {mode === "list" && (
        <ListView loading={loading} visits={visits} reload={reload} onNew={() => { reset(); setMode("choose"); }} />
      )}

      {mode === "choose" && (
        <ChooseView onPerson={() => { reset(); setMode("capture"); }} onVehicle={() => { reset(); setMode("vehicle"); }} />
      )}

      {mode === "capture" && (
        <CaptureView
          photo={photos[0] || null}
          scanProgress={scanProgress}
          scanFailed={scanFailed}
          onCamera={() => pickIdPhoto("camera")}
          onGallery={() => pickIdPhoto("gallery")}
          onContinue={() => setMode("form")}
          onSkip={() => { setPhotos([]); setMode("form"); }}
        />
      )}

      {mode === "form" && (
        <PersonForm
          fields={fields}
          setFields={setFields}
          photos={photos}
          addPhoto={addPhoto}
          removePhoto={removePhoto}
          station={station}
          onDone={() => { setMode("list"); reload(); }}
        />
      )}

      {mode === "vehicle" && (
        <VehicleForm
          photos={photos}
          addPhoto={addPhoto}
          removePhoto={removePhoto}
          station={station}
          onDone={() => { setMode("list"); reload(); }}
        />
      )}
    </div>
  );
}

/* ----------------------------- list ----------------------------- */
function ListView({ loading, visits, reload, onNew }: { loading: boolean; visits: any[]; reload: () => void; onNew: () => void; }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <Loader />
        ) : visits.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={32} className="mx-auto mb-3 text-low" />
            <p className="text-sm text-muted">{t("visitor.empty")}</p>
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {visits.map((v: any, i: number) => {
              const name = [v.firstName, v.lastName].filter(Boolean).join(" ") || (v.vehiclePlate || "—");
              const isVehicle = !v.firstName && !v.lastName && !!v.vehiclePlate;
              const out = !!v.exitTime;
              // Prefer the backend's token-based downloadUrl (never a raw privateUrl).
              const photoUrl = fileUrlFromFile(v.idPhoto);
              return (
                <div key={v.id || i} className="card flex items-center gap-3 p-3">
                  {photoUrl ? (
                    <img src={photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover"
                      onError={(e) => { const el = e.target as HTMLImageElement; el.style.display = "none"; el.nextElementSibling?.classList.remove("hidden"); }} />
                  ) : null}
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted ${photoUrl ? "hidden" : ""}`}>
                    <Camera size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {isVehicle && <Car size={13} className="mr-1 inline align-[-2px]" />}{name}
                      {v.tagNumber ? <span className="ml-2 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">#{v.tagNumber}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted">{[v.idNumber, v.reason].filter(Boolean).join(" · ") || "—"}</p>
                    <p className="mt-0.5 text-[11px] text-faint">{fmtTime(v.visitDate)}{out ? <><ArrowRight size={11} className="mx-0.5 inline align-[-1px]" />{fmtTime(v.exitTime)}</> : null}</p>
                  </div>
                  {out ? (
                    <span className="shrink-0 rounded-md border border-line-2 px-2 py-0.5 text-[11px] text-muted">{t("visitor.checkedOut")}</span>
                  ) : (
                    <CheckoutButton id={v.id} onDone={reload} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="border-t border-line px-4 pt-3" style={footerStyle}>
        <button onClick={onNew} className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover">
          <UserPlus size={18} />
          {t("visitor.register")}
        </button>
      </div>
    </>
  );
}

/* ---------------------------- choose ---------------------------- */
function ChooseView({ onPerson, onVehicle }: { onPerson: () => void; onVehicle: () => void }) {
  const { t } = useTranslation();
  const opts = [
    { icon: <User size={26} />, title: t("visitor.modePerson"), desc: t("visitor.modePersonDesc"), onClick: onPerson, tone: "text-gold border-gold/30" },
    { icon: <Car size={26} />, title: t("visitor.modeVehicle"), desc: t("visitor.modeVehicleDesc"), onClick: onVehicle, tone: "text-info border-info/30" },
  ];
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <p className="mb-5 text-center text-sm text-muted">{t("visitor.chooseTitle")}</p>
      <div className="space-y-4">
        {opts.map((o) => (
          <button key={o.title} onClick={o.onClick} className={`card flex w-full items-center gap-4 p-6 text-left active:opacity-80 ${o.tone}`}>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-current/20 bg-current/10">
              {o.icon}
            </span>
            <span className="flex-1">
              <span className="block text-base font-semibold text-ink">{o.title}</span>
              <span className="block text-xs text-muted">{o.desc}</span>
            </span>
            <ChevronRight size={20} className="text-muted" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- capture --------------------------- */
function CaptureView({ photo, scanProgress, scanFailed, onCamera, onGallery, onContinue, onSkip }: {
  photo: CapturedImage | null; scanProgress: number | null; scanFailed: boolean;
  onCamera: () => void; onGallery: () => void; onContinue: () => void; onSkip: () => void;
}) {
  const { t } = useTranslation();
  const scanning = scanProgress !== null;
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 text-center text-sm text-muted">{t("visitor.scanHint")}</p>
        <div className="relative mx-auto aspect-[1.586/1] w-full max-w-sm overflow-hidden rounded-2xl border-2 border-dashed border-line-2 bg-surface">
          {photo ? (
            <img src={photo.dataUrl} alt="ID" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-low">
              <Camera size={40} />
              <span className="mt-2 text-xs">{t("visitor.idPhotoLabel")}</span>
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy/70">
              <ScanLine size={28} className="mb-2 animate-pulse text-gold" />
              <p className="text-sm font-medium text-gold">{t("visitor.scanning")}</p>
              {scanProgress! > 0 && (
                <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-gold" style={{ width: `${scanProgress}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
        {scanFailed && !scanning && <p className="mt-3 text-center text-xs text-high">{t("visitor.scanFailed")}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={onCamera} disabled={scanning} className="btn-xl border border-gold/40 bg-gold-soft text-gold disabled:opacity-50">
            {photo ? <RotateCcw size={18} /> : <Camera size={18} />}
            {photo ? t("visitor.retake") : t("visitor.takePhoto")}
          </button>
          <button onClick={onGallery} disabled={scanning} className="btn-xl border border-line text-muted disabled:opacity-50">
            <Images size={18} />
            {t("visitor.choosePhoto")}
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-t border-line px-4 pt-3" style={footerStyle}>
        <button onClick={onSkip} className="btn-xl flex-1 border border-line text-muted">{t("visitor.skipPhoto")}</button>
        <button onClick={onContinue} disabled={!photo || scanning} className="btn-xl flex-[2] bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50">
          {scanning ? <Loader2 size={18} className="animate-spin" /> : t("visitor.continue")}
        </button>
      </div>
    </>
  );
}

/* --------------------------- photo strip ------------------------ */
function PhotoStrip({ photos, onAdd, onRemove }: {
  photos: CapturedImage[];
  onAdd: (s: "camera" | "gallery") => void;
  onRemove: (i: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      {photos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-20 w-20">
              <img src={p.dataUrl} alt="" className="h-full w-full rounded-xl border border-line object-cover" />
              <button
                onClick={() => onRemove(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-white"
              >
                <X size={12} />
              </button>
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 rounded-b-xl bg-navy/70 py-0.5 text-center text-[9px] text-gold">
                  {t("visitor.idPhotoLabel")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Every image can be taken with the camera OR chosen from the gallery. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onAdd("camera")}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold-soft text-sm font-semibold text-gold whitespace-nowrap active:opacity-80"
        >
          <Camera size={18} className="shrink-0" />
          {t("app.takePhoto")}
        </button>
        <button
          onClick={() => onAdd("gallery")}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-muted whitespace-nowrap active:opacity-80"
        >
          <Images size={18} className="shrink-0" />
          {t("app.fromGallery")}
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

/* --------------------------- person form ------------------------ */
function PersonForm({ fields, setFields, photos, addPhoto, removePhoto, station, onDone }: {
  fields: Fields; setFields: React.Dispatch<React.SetStateAction<Fields>>;
  photos: CapturedImage[]; addPhoto: (s: "camera" | "gallery") => void; removePhoto: (i: number) => void;
  station: any; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Fields, v: any) => setFields((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!fields.firstName.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const idPhoto = await uploadAll(photos);
      await visitorService.create({
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim() || undefined,
        idNumber: fields.idNumber.trim() || undefined,
        idType: fields.idType,
        birthDate: fields.birthDate || undefined,
        idExpiry: fields.expiryDate || undefined,
        phone: fields.phone.trim() || undefined,
        reason: fields.reason.trim() || undefined,
        personVisited: fields.personVisited.trim() || undefined,
        company: fields.company.trim() || undefined,
        vehiclePlate: fields.vehiclePlate.trim().toUpperCase() || undefined,
        tagNumber: fields.tagNumber.trim() || undefined,
        numPeople: Number(fields.numPeople) || 1,
        visitDate: new Date().toISOString(),
        stationId: station?.id, stationName: station?.stationName || station?.name, postSiteId: station?.postSiteId,
        idPhoto,
      });
      onDone();
    } catch (e: any) { setError(e?.message || "error"); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
        <Field label={t("visitor.photos")}>
          <PhotoStrip photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
        </Field>

        <Field label={t("visitor.idType")}>
          <div className="flex gap-1 rounded-full border border-line bg-white/5 p-1">
            {ID_TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => set("idType", ty)}
                className={`flex-1 rounded-full px-2 py-2.5 text-[13px] font-semibold transition-colors ${
                  fields.idType === ty
                    ? "bg-gold text-navy shadow-sm"
                    : "text-muted active:bg-white/5"
                }`}
              >
                {t(`visitor.idTypes.${ty}`)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("visitor.firstName")}><input className={inputCls} value={fields.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label={t("visitor.lastName")}><input className={inputCls} value={fields.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
        </div>

        <Field label={t("visitor.idNumber")}><input className={inputCls} inputMode="numeric" value={fields.idNumber} onChange={(e) => set("idNumber", e.target.value)} /></Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("visitor.birthDate")}><input type="date" className={inputCls} value={fields.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
          <Field label={t("visitor.expiryDate")}><input type="date" className={inputCls} value={fields.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("visitor.tagNumber")}>
            <div className="relative">
              <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
              <input className={`${inputCls} pl-9`} value={fields.tagNumber} onChange={(e) => set("tagNumber", e.target.value)} />
            </div>
          </Field>
          <Field label={t("visitor.numPeople")}><input type="number" min={1} className={inputCls} value={fields.numPeople} onChange={(e) => set("numPeople", Number(e.target.value))} /></Field>
        </div>

        <Field label={t("visitor.phone")}><input className={inputCls} inputMode="tel" value={fields.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label={t("visitor.personVisited")}><input className={inputCls} value={fields.personVisited} onChange={(e) => set("personVisited", e.target.value)} /></Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("visitor.company")}><input className={inputCls} value={fields.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label={t("visitor.vehiclePlate")}><input className={`${inputCls} uppercase`} value={fields.vehiclePlate} onChange={(e) => set("vehiclePlate", e.target.value)} /></Field>
        </div>

        <Field label={t("visitor.reason")}><textarea rows={2} className={`${inputCls} resize-none`} value={fields.reason} onChange={(e) => set("reason", e.target.value)} /></Field>

        {error && <p className="text-sm text-critical">{error}</p>}
      </div>

      <div className="border-t border-line px-4 pt-3" style={footerStyle}>
        <button onClick={submit} disabled={busy || !fields.firstName.trim()} className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} />{t("visitor.save")}</>}
        </button>
      </div>
    </>
  );
}

/* --------------------------- vehicle form ----------------------- */
function VehicleForm({ photos, addPhoto, removePhoto, station, onDone }: {
  photos: CapturedImage[]; addPhoto: (s: "camera" | "gallery") => void; removePhoto: (i: number) => void;
  station: any; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState<string>("car");
  const [driver, setDriver] = useState("");
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState("");
  const [numPeople, setNumPeople] = useState(1);
  const [tagNumber, setTagNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!plate.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const idPhoto = await uploadAll(photos);
      const p = plate.trim().toUpperCase();
      const base = reason.trim() || t("visitor.modeVehicle");
      await visitorService.create({
        firstName: driver.trim() || t("visitor.modeVehicle"),
        idType: "vehicle",
        vehiclePlate: p,
        vehicleType,
        company: company.trim() || undefined,
        tagNumber: tagNumber.trim() || undefined,
        reason: `${base} · ${t("visitor.vehiclePlate")}: ${p}`,
        placeType: "vehiculo",
        numPeople: Number(numPeople) || 1,
        visitDate: new Date().toISOString(),
        stationId: station?.id, stationName: station?.stationName || station?.name, postSiteId: station?.postSiteId,
        idPhoto,
      });
      onDone();
    } catch (e: any) { setError(e?.message || "error"); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
        <Field label={t("visitor.vehiclePlate")}>
          <input className={`${inputCls} text-center text-xl font-bold uppercase tracking-widest`} placeholder="ABC-1234" value={plate} onChange={(e) => setPlate(e.target.value)} />
        </Field>

        <Field label={t("visitor.vehicleType")}>
          <div className="flex gap-1 rounded-full border border-line bg-white/5 p-1">
            {VEHICLE_TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => setVehicleType(ty)}
                className={`flex-1 rounded-full px-1 py-2.5 text-xs font-semibold transition-colors ${
                  vehicleType === ty
                    ? "bg-gold text-navy shadow-sm"
                    : "text-muted active:bg-white/5"
                }`}
              >
                {t(`visitor.vehicleTypes.${ty}`)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("visitor.driver")}><input className={inputCls} value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
          <Field label={t("visitor.tagNumber")}>
            <div className="relative">
              <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
              <input className={`${inputCls} pl-9`} value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("visitor.company")}><input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <Field label={t("visitor.numPeople")}><input type="number" min={1} className={inputCls} value={numPeople} onChange={(e) => setNumPeople(Number(e.target.value))} /></Field>
        </div>

        <Field label={t("visitor.reason")}><textarea rows={2} className={`${inputCls} resize-none`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>

        <Field label={t("visitor.vehiclePhoto")}>
          <PhotoStrip photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
        </Field>

        {error && <p className="text-sm text-critical">{error}</p>}
      </div>

      <div className="border-t border-line px-4 pt-3" style={footerStyle}>
        <button onClick={submit} disabled={busy || !plate.trim()} className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} />{t("visitor.save")}</>}
        </button>
      </div>
    </>
  );
}

function CheckoutButton({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => { setBusy(true); try { await visitorService.checkout(id); onDone(); } finally { setBusy(false); } }}
      className="flex shrink-0 items-center gap-1 rounded-md border border-online/40 bg-online/5 px-2 py-1 text-[11px] font-medium text-online active:opacity-70">
      {busy ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
      {t("visitor.checkout")}
    </button>
  );
}
