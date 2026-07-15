import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IonModal } from "@ionic/react";
import { modalEnterAnimation, modalLeaveAnimation } from "@/lib/modalAnimation";
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
  Phone,
  MapPin,
  Calendar,
  CalendarX,
  Clock,
  Building2,
  CreditCard,
  Fingerprint,
  LogIn,
  QrCode,
} from "lucide-react";
import { visitorService, VisitorPhoto } from "@/lib/services";
import { VisitorPreAuthScan } from "./VisitorPreAuthScan";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { useAsync } from "@/lib/useAsync";
import { fmtTime, fmtDateTime } from "@/lib/format";
import { SkeletonList, EmptyState } from "./ui";
import { Button, SectionCard, SectionHeader, InfoCell, StatusPill, IconTile } from "./ui/kit";
import { compressImage, takeNativePhoto, isNative, CapturedImage } from "@/lib/capture";
import { scanId } from "@/lib/ocr";
import i18n from "@/i18n";

type Mode = "list" | "detail" | "choose" | "capture" | "form" | "vehicle";
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

/** Map a save error to a clear Spanish message (never the raw backend "Extraviado"). */
function friendlyVisitError(e: any): string {
  const status = e?.status;
  const msg: string | undefined = e?.message;
  if (status === 0) return i18n.t("visitor.preauth.networkError", "Sin conexión. Revisa tu internet e intenta de nuevo.");
  if (status === 403) return i18n.t("visitor.noPermission", "No tienes permiso para registrar visitas en este puesto.");
  if (status === 404 || !msg || msg === "Extraviado") {
    return i18n.t("visitor.saveFailed", "No se pudo registrar la visita. Verifica los datos e intenta de nuevo.");
  }
  return msg;
}

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

/** Upload a single photo (e.g. the face) as a one-element descriptor array. */
async function uploadOne(photo: CapturedImage | null): Promise<any[] | undefined> {
  if (!photo) return undefined;
  return uploadAll([photo]);
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
    <IonModal isOpen={isOpen} onDidDismiss={onClose} enterAnimation={modalEnterAnimation} leaveAnimation={modalLeaveAnimation}>
      {isOpen && <VisitorFlow station={station} onClose={onClose} />}
    </IonModal>
  );
}

export function VisitorFlow({ station, onClose, embedded }: { station: any; onClose: () => void; embedded?: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("list");
  const [scanPreAuth, setScanPreAuth] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [photos, setPhotos] = useState<CapturedImage[]>([]);
  const [facePhoto, setFacePhoto] = useState<CapturedImage | null>(null);
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
    visitorService.list({ limit: 50, withPhotos: 1 }).catch(() => [])
  );
  const visits = (data || []).filter((v: any) =>
    station?.id ? v.stationId === station.id || !v.stationId : true
  );

  // Track whether the next web <input> pick should be compressed at hi-res (the
  // ID document) vs the lighter default (face / extra photos).
  const webHiRes = useRef(false);
  const capture = (
    source: "camera" | "gallery",
    opts: { hiRes?: boolean } = {}
  ): Promise<CapturedImage | null> => {
    if (isNative()) return takeNativePhoto(source, opts).catch(() => null);
    return new Promise((resolve) => {
      webResolver.current = resolve;
      webHiRes.current = !!opts.hiRes;
      (source === "camera" ? cameraInput : galleryInput).current?.click();
    });
  };
  const onWebPick = async (file?: File | null) => {
    const r = webResolver.current;
    const hiRes = webHiRes.current;
    webResolver.current = null;
    webHiRes.current = false;
    if (!file) return r?.(null);
    try {
      r?.(await (hiRes ? compressImage(file, 1800, 0.85) : compressImage(file)));
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

  // ID capture (the document): photo[0] + OCR. Captured at hi-res for OCR.
  const pickIdPhoto = async (source: "camera" | "gallery") => {
    const img = await capture(source, { hiRes: true });
    if (!img) return;
    setPhotos((p) => (p.length ? [img, ...p.slice(1)] : [img]));
    runScan(img);
  };
  // Face capture (the person). Normal/light compression — no OCR.
  const pickFacePhoto = async (source: "camera" | "gallery") => {
    const img = await capture(source);
    if (img) setFacePhoto(img);
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
    setFacePhoto(null);
    setFields(EMPTY);
    setScanFailed(false);
    setScanProgress(null);
  };

  const headerTitle =
    mode === "list"
      ? t("visitor.title")
      : mode === "detail"
        ? t("visitor.detailTitle")
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
    else { setMode("list"); setSelected(null); }
  };

  const openDetail = (v: any) => { setSelected(v); setMode("detail"); };

  return (
    <div className="flex h-full flex-col overflow-x-hidden bg-background">
      <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
        {mode === "list" ? (
          // Embedded as a pushed screen → a back button pops the stack; as a
          // modal → just the section icon (the X handles closing).
          embedded ? (
            <button onClick={onClose} className="pressable text-muted" aria-label={t("aria.back", "Atrás")}>
              <ArrowLeft size={20} />
            </button>
          ) : (
            <Users size={18} className="text-gold" />
          )
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
        <ListView
          loading={loading}
          visits={visits}
          reload={reload}
          onNew={() => { reset(); setMode("choose"); }}
          onOpen={openDetail}
          onScanPreAuth={() => setScanPreAuth(true)}
        />
      )}

      {/* Visitor pre-authorization QR scanner — full-screen overlay. Refresh the
          visit list on a successful scan (the backend created the log). */}
      {scanPreAuth && (
        <VisitorPreAuthScan
          onClose={() => setScanPreAuth(false)}
          onRegistered={reload}
        />
      )}

      {mode === "detail" && selected && (
        <VisitorDetail
          visit={selected}
          station={station}
          onCheckedOut={(updated) => { setSelected(updated); reload(); }}
        />
      )}

      {mode === "choose" && (
        <ChooseView onPerson={() => { reset(); setMode("capture"); }} onVehicle={() => { reset(); setMode("vehicle"); }} />
      )}

      {mode === "capture" && (
        <CaptureView
          photo={photos[0] || null}
          facePhoto={facePhoto}
          scanProgress={scanProgress}
          scanFailed={scanFailed}
          onIdCamera={() => pickIdPhoto("camera")}
          onIdGallery={() => pickIdPhoto("gallery")}
          onFaceCamera={() => pickFacePhoto("camera")}
          onFaceGallery={() => pickFacePhoto("gallery")}
          onContinue={() => setMode("form")}
          onSkip={() => { setPhotos([]); setFacePhoto(null); setMode("form"); }}
        />
      )}

      {mode === "form" && (
        <PersonForm
          fields={fields}
          setFields={setFields}
          photos={photos}
          facePhoto={facePhoto}
          addPhoto={addPhoto}
          removePhoto={removePhoto}
          station={station}
          onDone={() => { setMode("list"); reload(); }}
        />
      )}

      {mode === "vehicle" && (
        <VehicleForm
          photos={photos}
          facePhoto={facePhoto}
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
/** Short date+time for the visitor card (e.g. "May 20, 8:45 AM"). */
function fmtDT(iso: any): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A labelled icon field inside a visitor card. */
function VInfo({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted">{label}</p>
        <p className="truncate text-[13px] font-semibold text-ink">{value || "—"}</p>
      </div>
    </div>
  );
}

function ListView({ loading, visits, reload, onNew, onOpen, onScanPreAuth }: { loading: boolean; visits: any[]; reload: () => void; onNew: () => void; onOpen: (v: any) => void; onScanPreAuth: () => void; }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <SkeletonList rows={5} />
        ) : visits.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title={t("visitor.empty")} />
        ) : (
          <div className="space-y-2 pb-2">
            {visits.map((v: any, i: number) => {
              const name = [v.firstName, v.lastName].filter(Boolean).join(" ") || (v.vehiclePlate || "—");
              const isVehicle = !v.firstName && !v.lastName && !!v.vehiclePlate;
              const out = !!v.exitTime;
              // Prefer the backend's token-based downloadUrl (never a raw privateUrl).
              // Prefer the person's face photo as the thumbnail; fall back to the ID photo.
              const photoUrl = fileUrlFromFile(v.facePhoto) || fileUrlFromFile(v.idPhoto);
              const vehicle = v.vehiclePlate ? `${v.vehiclePlate}${v.vehicleType ? ` (${v.vehicleType})` : ""}` : null;
              const dotColor = out ? "#9aa3af" : "#22c55e";
              return (
                <div key={v.id || i} className="rounded-2xl border border-line bg-surface p-3.5">
                  {/* Tapping the card opens the detail; check-out is a separate tap target. */}
                  <button onClick={() => onOpen(v)} className="pressable block w-full text-left">
                    <div className="flex items-start gap-3">
                      <span className="relative shrink-0">
                        {photoUrl ? (
                          <img src={photoUrl} alt="" className="h-12 w-12 rounded-full border border-line object-cover"
                            onError={(e) => { const el = e.target as HTMLImageElement; el.style.display = "none"; el.nextElementSibling?.classList.remove("hidden"); }} />
                        ) : null}
                        <span className={`grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted ${photoUrl ? "hidden" : ""}`}>
                          <Camera size={18} />
                        </span>
                        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface" style={{ background: dotColor }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-bold text-ink">
                          {isVehicle && <Car size={14} className="mr-1 inline align-[-2px]" />}{name}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
                        style={out ? { color: "#9aa3af", borderColor: "#9aa3af66" } : { color: "#22c55e", borderColor: "#22c55e66" }}>
                        {out ? t("visitor.checkedOut") : t("visitor.checkedIn", "Dentro")}
                      </span>
                    </div>

                    <div className="mt-3 flex gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <VInfo icon={<Building2 size={14} />} label={t("visitor.company", "Empresa")} value={v.company} />
                        <VInfo icon={<User size={14} />} label={t("visitor.host", "Anfitrión")} value={v.personVisited} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2 border-l border-line pl-3">
                        <VInfo icon={<CreditCard size={14} />} label={t("visitor.badge", "Credencial")} value={v.tagNumber} />
                        <VInfo icon={<Car size={14} />} label={t("visitor.vehicle", "Vehículo")} value={vehicle} />
                      </div>
                    </div>

                    <div className="mt-3 flex gap-3 border-t border-line pt-3">
                      <VInfo icon={<Calendar size={14} />} label={t("visitor.checkedIn", "Entrada")} value={fmtDT(v.visitDate)} />
                      <VInfo icon={out ? <Clock size={14} /> : <Calendar size={14} />} label={out ? t("visitor.checkedOut") : t("visitor.expectedDeparture", "Salida est.")} value={out ? fmtDT(v.exitTime) : "—"} />
                    </div>
                  </button>

                  {!out && (
                    <div className="mt-3">
                      <CheckoutButton id={v.id} onDone={reload} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="space-y-2 border-t border-line px-4 pt-3" style={footerStyle}>
        {/* Pre-authorized visitor pass — scan the QR the client generated. */}
        <button
          onClick={onScanPreAuth}
          className="pressable flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3 text-left active:opacity-80"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <QrCode size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{t("visitor.preauth.scanButton")}</span>
            <span className="block truncate text-xs text-muted">{t("visitor.preauth.scanSubtitle")}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-gold" />
        </button>
        <Button variant="primary" full onClick={onNew}>
          <UserPlus size={18} />
          {t("visitor.register")}
        </Button>
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
function CaptureView({
  photo, facePhoto, scanProgress, scanFailed,
  onIdCamera, onIdGallery, onFaceCamera, onFaceGallery, onContinue, onSkip,
}: {
  photo: CapturedImage | null; facePhoto: CapturedImage | null;
  scanProgress: number | null; scanFailed: boolean;
  onIdCamera: () => void; onIdGallery: () => void;
  onFaceCamera: () => void; onFaceGallery: () => void;
  onContinue: () => void; onSkip: () => void;
}) {
  const { t } = useTranslation();
  const scanning = scanProgress !== null;
  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 text-center text-sm text-muted">{t("visitor.scanHint")}</p>

        {/* ID document — drives OCR. */}
        <p className="label-eyebrow mb-1.5">{t("visitor.idPhotoLabel", "Foto de cédula/ID")}</p>
        <div className="relative mx-auto aspect-[1.586/1] w-full max-w-sm overflow-hidden rounded-2xl border-2 border-dashed border-line-2 bg-surface">
          {photo ? (
            <img src={photo.dataUrl} alt="ID" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-low">
              <Camera size={40} />
              <span className="mt-2 text-xs">{t("visitor.idPhotoLabel", "Foto de cédula/ID")}</span>
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70">
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

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={onIdCamera} disabled={scanning} className="btn-xl border border-gold/40 bg-gold-soft text-gold disabled:opacity-50">
            {photo ? <RotateCcw size={18} /> : <Camera size={18} />}
            {photo ? t("visitor.retake") : t("visitor.takePhoto")}
          </button>
          <button onClick={onIdGallery} disabled={scanning} className="btn-xl border border-line text-muted disabled:opacity-50">
            <Images size={18} />
            {t("visitor.choosePhoto")}
          </button>
        </div>

        {/* Face photo — the person. No OCR. */}
        <p className="label-eyebrow mb-1.5 mt-6">{t("visitor.facePhotoLabel", "Foto de la persona")}</p>
        <div className="relative mx-auto aspect-square w-full max-w-[12rem] overflow-hidden rounded-2xl border-2 border-dashed border-line-2 bg-surface">
          {facePhoto ? (
            <img src={facePhoto.dataUrl} alt="Persona" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-low">
              <User size={40} />
              <span className="mt-2 text-xs">{t("visitor.facePhotoLabel", "Foto de la persona")}</span>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={onFaceCamera} disabled={scanning} className="btn-xl border border-gold/40 bg-gold-soft text-gold disabled:opacity-50">
            {facePhoto ? <RotateCcw size={18} /> : <Camera size={18} />}
            {facePhoto ? t("visitor.retake") : t("visitor.takePhoto")}
          </button>
          <button onClick={onFaceGallery} disabled={scanning} className="btn-xl border border-line text-muted disabled:opacity-50">
            <Images size={18} />
            {t("visitor.choosePhoto")}
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-t border-line px-4 pt-3" style={footerStyle}>
        <Button variant="outline" onClick={onSkip} className="flex-1">{t("visitor.skipPhoto")}</Button>
        <Button variant="primary" onClick={onContinue} disabled={(!photo && !facePhoto) || scanning} className="flex-[2]">
          {scanning ? <Loader2 size={18} className="animate-spin" /> : t("visitor.continue")}
        </Button>
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
                <span className="absolute bottom-0 left-0 right-0 rounded-b-xl bg-on-accent/70 py-0.5 text-center text-[11px] text-gold">
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
function PersonForm({ fields, setFields, photos, facePhoto, addPhoto, removePhoto, station, onDone }: {
  fields: Fields; setFields: React.Dispatch<React.SetStateAction<Fields>>;
  photos: CapturedImage[]; facePhoto: CapturedImage | null;
  addPhoto: (s: "camera" | "gallery") => void; removePhoto: (i: number) => void;
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
      // Upload ID/extra photos and the face photo as SEPARATE fields. A failed
      // upload yields `undefined` but never blocks saving the text data.
      const idPhoto = await uploadAll(photos);
      const facePhotoUp = await uploadOne(facePhoto);
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
        facePhoto: facePhotoUp,
      });
      onDone();
    } catch (e: any) { setError(friendlyVisitError(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
        {facePhoto && (
          <Field label={t("visitor.facePhotoLabel", "Foto de la persona")}>
            <img src={facePhoto.dataUrl} alt="Persona" className="h-24 w-24 rounded-xl border border-line object-cover" />
          </Field>
        )}

        <Field label={t("visitor.photos")}>
          <PhotoStrip photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
        </Field>

        <Field label={t("visitor.idType")}>
          <div className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
            {ID_TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => set("idType", ty)}
                className={`min-h-11 flex-1 rounded-full px-2 py-3 text-sm font-semibold transition-colors ${
                  fields.idType === ty
                    ? "bg-gold text-on-accent shadow-sm"
                    : "text-muted active:bg-surface"
                }`}
              >
                {t(`visitor.idTypes.${ty}`)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4">
          <Field label={t("visitor.firstName")}><input className={inputCls} value={fields.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label={t("visitor.lastName")}><input className={inputCls} value={fields.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
        </div>

        <Field label={t("visitor.idNumber")}><input className={inputCls} inputMode="numeric" value={fields.idNumber} onChange={(e) => set("idNumber", e.target.value)} /></Field>

        <div className="grid grid-cols-1 gap-4">
          <Field label={t("visitor.birthDate")}><input type="date" className={inputCls} value={fields.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
          <Field label={t("visitor.expiryDate")}><input type="date" className={inputCls} value={fields.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-1 gap-4">
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

        <div className="grid grid-cols-1 gap-4">
          <Field label={t("visitor.company")}><input className={inputCls} value={fields.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label={t("visitor.vehiclePlate")}><input className={`${inputCls} uppercase`} value={fields.vehiclePlate} onChange={(e) => set("vehiclePlate", e.target.value)} /></Field>
        </div>

        <Field label={t("visitor.reason")}><textarea rows={2} className={`${inputCls} resize-none`} value={fields.reason} onChange={(e) => set("reason", e.target.value)} /></Field>

        {error && <p className="text-sm text-critical">{error}</p>}
      </div>

      <div className="border-t border-line px-4 pt-3" style={footerStyle}>
        <Button variant="primary" full onClick={submit} disabled={busy || !fields.firstName.trim()}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} />{t("visitor.save")}</>}
        </Button>
      </div>
    </>
  );
}

/* --------------------------- vehicle form ----------------------- */
function VehicleForm({ photos, facePhoto, addPhoto, removePhoto, station, onDone }: {
  photos: CapturedImage[]; facePhoto: CapturedImage | null;
  addPhoto: (s: "camera" | "gallery") => void; removePhoto: (i: number) => void;
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
      const facePhotoUp = await uploadOne(facePhoto);
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
        facePhoto: facePhotoUp,
      });
      onDone();
    } catch (e: any) { setError(friendlyVisitError(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
        <Field label={t("visitor.vehiclePlate")}>
          <input className={`${inputCls} text-center text-xl font-bold uppercase tracking-widest`} placeholder="ABC-1234" value={plate} onChange={(e) => setPlate(e.target.value)} />
        </Field>

        <Field label={t("visitor.vehicleType")}>
          <div className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
            {VEHICLE_TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => setVehicleType(ty)}
                className={`min-h-11 flex-1 rounded-full px-1 py-3 text-[13px] font-semibold transition-colors ${
                  vehicleType === ty
                    ? "bg-gold text-on-accent shadow-sm"
                    : "text-muted active:bg-surface"
                }`}
              >
                {t(`visitor.vehicleTypes.${ty}`)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4">
          <Field label={t("visitor.driver")}><input className={inputCls} value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
          <Field label={t("visitor.tagNumber")}>
            <div className="relative">
              <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold" />
              <input className={`${inputCls} pl-9`} value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4">
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
        <Button variant="primary" full onClick={submit} disabled={busy || !plate.trim()}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} />{t("visitor.save")}</>}
        </Button>
      </div>
    </>
  );
}

/* ---------------------------- detail ---------------------------- */
function VisitorDetail({ visit, station, onCheckedOut }: { visit: any; station: any; onCheckedOut: (updated: any) => void }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const isVehicle = !visit.firstName && !visit.lastName && !!visit.vehiclePlate;
  const name = [visit.firstName, visit.lastName].filter(Boolean).join(" ") || visit.vehiclePlate || "—";
  const out = !!visit.exitTime;

  // Photos: face is the hero, then any ID document photos. All open in a lightbox.
  const faceUrl = fileUrlFromFile(visit.facePhoto);
  const idUrls = (Array.isArray(visit.idPhoto) ? visit.idPhoto : visit.idPhoto ? [visit.idPhoto] : [])
    .map((f: any) => fileUrlFromFile(f))
    .filter(Boolean) as string[];
  const heroUrl = faceUrl || idUrls[0] || null;
  const galleryUrls = [faceUrl, ...idUrls].filter(Boolean) as string[];

  // DATEONLY fields (birth/expiry) must render tz-neutral — formatting them in a
  // west-of-UTC tenant timezone would shift the day backwards.
  const dOnly = (v: any): string | null => {
    if (!v) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    const loc = i18n.language?.startsWith("en") ? "en-US" : "es-ES";
    try {
      return new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeZone: "UTC" })
        .format(new Date(m ? `${m[1]}-${m[2]}-${m[3]}T00:00:00Z` : v));
    } catch { return String(v); }
  };

  const idTypeLabel = visit.idType && visit.idType !== "vehicle"
    ? t(`visitor.idTypes.${visit.idType}`, visit.idType)
    : null;
  const stationLabel = visit.stationName || station?.stationName || station?.name || null;

  const identity: Row[] = [
    [<CreditCard size={16} />, t("visitor.idType"), idTypeLabel],
    [<Fingerprint size={16} />, t("visitor.idNumber"), visit.idNumber],
    [<Calendar size={16} />, t("visitor.birthDate"), dOnly(visit.birthDate)],
    [<CalendarX size={16} />, t("visitor.expiryDate"), dOnly(visit.idExpiry)],
  ];
  const visitInfo: Row[] = [
    [<User size={16} />, t("visitor.personVisited"), visit.personVisited],
    [<Building2 size={16} />, t("visitor.company"), visit.company],
    [<MapPin size={16} />, t("visitor.station"), stationLabel],
    [<Clock size={16} />, t("visitor.reason"), visit.reason],
  ];
  const vehicleInfo: Row[] = [
    [<Car size={16} />, t("visitor.vehiclePlate"), visit.vehiclePlate],
    [<Car size={16} />, t("visitor.vehicleType"), visit.vehicleType ? t(`visitor.vehicleTypes.${visit.vehicleType}`, visit.vehicleType) : null],
  ];

  const checkout = async () => {
    setBusy(true);
    try {
      await visitorService.checkout(visit.id);
      onCheckedOut({ ...visit, exitTime: new Date().toISOString() });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* Hero */}
        <SectionCard className="flex flex-col items-center text-center">
          {heroUrl ? (
            <button onClick={() => setLightbox(heroUrl)} className="pressable">
              <img src={heroUrl} alt="" className="h-24 w-24 rounded-2xl border border-line object-cover" />
            </button>
          ) : (
            <span className="grid h-24 w-24 place-items-center rounded-2xl bg-surface-2 text-muted">
              {isVehicle ? <Car size={34} /> : <User size={34} />}
            </span>
          )}
          <h3 className="mt-3 flex items-center gap-1.5 text-lg font-bold text-ink">
            {isVehicle && <Car size={18} className="text-info" />}{name}
          </h3>
          {(idTypeLabel || visit.idNumber) && (
            <p className="mt-0.5 text-sm text-muted">{[idTypeLabel, visit.idNumber].filter(Boolean).join(" · ")}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <StatusPill tone={out ? "neutral" : "green"}>{out ? t("visitor.checkedOut") : t("visitor.inside")}</StatusPill>
            {visit.tagNumber && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-gold">
                <Hash size={11} />{visit.tagNumber}
              </span>
            )}
          </div>
        </SectionCard>

        {/* Entry / exit / people */}
        <SectionCard inset={false} className="flex items-stretch divide-x divide-line py-4">
          <InfoCell icon={<LogIn size={16} />} tone="green" label={t("visitor.entryTime")} value={fmtTime(visit.visitDate)} />
          <InfoCell icon={<LogOut size={16} />} tone={out ? "neutral" : "amber"} label={t("visitor.exitTimeLabel")} value={out ? fmtTime(visit.exitTime) : "—"} />
          <InfoCell icon={<Users size={16} />} tone="blue" label={t("visitor.numPeople")} value={visit.numPeople || 1} />
        </SectionCard>

        <DetailSection title={t("visitor.identity")} rows={identity} />
        <DetailSection title={t("visitor.visitInfo")} rows={visitInfo} />
        {isVehicle && <DetailSection title={t("visitor.vehicleInfo")} rows={vehicleInfo} />}

        {/* Phone — a one-tap call action */}
        {visit.phone && (
          <a href={`tel:${visit.phone}`} className="pressable flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4 active:bg-surface-2">
            <IconTile tone="green"><Phone size={18} /></IconTile>
            <div className="min-w-0 flex-1">
              <p className="label-eyebrow">{t("visitor.phone")}</p>
              <p className="truncate text-[15px] font-semibold text-ink">{visit.phone}</p>
            </div>
            <span className="text-xs font-semibold text-online">{t("visitor.call")}</span>
          </a>
        )}

        {/* Photos */}
        {galleryUrls.length > 0 && (
          <div>
            <SectionHeader title={t("visitor.photos")} />
            <div className="grid grid-cols-3 gap-2">
              {galleryUrls.map((u, i) => (
                <button key={i} onClick={() => setLightbox(u)} className="pressable aspect-square overflow-hidden rounded-xl border border-line">
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="pt-1 text-center text-[11px] text-faint">{fmtDateTime(visit.visitDate)}</p>
      </div>

      {/* Action footer — only while the visitor is still inside */}
      {!out && (
        <div className="border-t border-line px-4 pt-3" style={footerStyle}>
          <Button variant="primary" full onClick={checkout} disabled={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <><LogOut size={18} />{t("visitor.checkout")}</>}
          </Button>
        </div>
      )}

      {/* Full-screen photo viewer — portalled to <body> so it covers the viewport
          even inside an Ionic page (whose transforms otherwise scope `fixed`). */}
      {lightbox && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button className="safe-top absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" onClick={() => setLightbox(null)} aria-label={t("app.close")}>
            <X size={22} />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}

/** A detail row: icon · eyebrow label · value (stacked, wraps cleanly). */
type Row = [React.ReactNode, string, any];
function DetailSection({ title, rows }: { title: string; rows: Row[] }) {
  const visible = rows.filter(([, , value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return null;
  return (
    <SectionCard inset={false} className="px-5 pb-3 pt-1">
      <p className="label-eyebrow pb-1 pt-3.5">{title}</p>
      <div className="divide-y divide-line">
        {visible.map(([icon, label, value], i) => (
          <div key={i} className="flex items-start gap-3 py-3">
            <span className="mt-0.5 shrink-0 text-faint">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="label-eyebrow">{label}</p>
              <p className="mt-0.5 break-words text-[14px] font-medium text-ink">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
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
