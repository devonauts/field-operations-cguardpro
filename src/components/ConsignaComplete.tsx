import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IonModal } from "@ionic/react";
import {
  X, Camera, Video, Mic, Square, Trash2, Check, Loader2, Clock, AlertCircle, ClipboardCheck,
} from "lucide-react";
import { consignasService, ConsignaItem } from "@/lib/rondas";
import { compressImage, CapturedImage } from "@/lib/capture";

const footerStyle = { paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" };
const PRIO: Record<string, string> = { alta: "text-critical", media: "text-gold", baja: "text-info" };

export function ConsignaComplete({
  isOpen, consigna, onClose, onDone,
}: { isOpen: boolean; consigna: ConsignaItem | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<CapturedImage[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // Keep a ref to the current object URL so we can revoke the previous one
  // whenever it changes or on unmount (object URLs hold the audio Blob alive).
  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  // Replace the audio URL, revoking any previous one first.
  const setAudio = (blob: Blob | null, url: string | null) => {
    if (audioUrlRef.current && audioUrlRef.current !== url) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    setAudioBlob(blob);
    setAudioUrl(url);
  };

  // Tear down the mic stream + recorder and revoke the audio URL on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const mr = recRef.current;
      if (mr && mr.state !== "inactive") mr.stop();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      recRef.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const stopMic = () => {
    const mr = recRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    recRef.current = null;
  };

  const handleClose = () => {
    stopMic();
    setRecording(false);
    onClose();
  };

  const reset = () => { setNote(""); setPhotos([]); setVideo(null); setAudio(null, null); setError(null); };

  const onPhoto = async (file?: File | null) => {
    if (!file) return;
    try { const img = await compressImage(file); setPhotos((p) => [...p, img]); } catch { /* ignore */ }
  };

  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // If we unmounted while awaiting permission, drop the stream immediately.
      if (!mountedRef.current) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (!mountedRef.current) return;
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudio(blob, URL.createObjectURL(blob));
      };
      mr.start(); recRef.current = mr; setRecording(true);
    } catch { /* mic denied */ }
  };
  const stopAudio = () => { recRef.current?.stop(); setRecording(false); };

  const submit = async () => {
    if (!consigna) return;
    setBusy(true);
    setError(null);
    try {
      const photoUrls: any[] = [];
      for (const p of photos) {
        try { photoUrls.push({ privateUrl: await consignasService.uploadMedia(p.file) }); } catch { /* skip */ }
      }
      let videoUrl: string | undefined;
      if (video) { try { videoUrl = await consignasService.uploadMedia(video); } catch { /* skip */ } }
      let audioUrlUp: string | undefined;
      if (audioBlob) {
        const af = new File([audioBlob], `voicenote-${Date.now()}.webm`, { type: "audio/webm" });
        try { audioUrlUp = await consignasService.uploadMedia(af); } catch { /* skip */ }
      }
      await consignasService.complete(consigna.id, {
        note: note.trim() || undefined,
        photos: photoUrls,
        videoUrl, audioUrl: audioUrlUp,
        occurrenceDate: consigna.occurrenceDate,
      });
      if (!mountedRef.current) return;
      reset(); onDone();
    } catch (e) {
      if (mountedRef.current) setError(t("consignas.completeError", "No se pudo completar la consigna. Intenta de nuevo."));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={handleClose}>
      <div className="flex h-full flex-col bg-background">
        <div className="safe-top flex items-center gap-2 border-b border-line px-4 py-3">
          <ClipboardCheck size={18} className="text-gold" />
          <h2 className="flex-1 text-base font-semibold text-ink">{t("consignas.complete", "Completar consigna")}</h2>
          <button onClick={handleClose} className="text-muted"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {consigna && (
            <div className="card p-3">
              <div className="flex items-center gap-2">
                <h3 className="flex-1 text-sm font-semibold text-ink">{consigna.title}</h3>
                <AlertCircle size={14} className={PRIO[consigna.priority] || "text-gold"} />
              </div>
              {consigna.description && <p className="mt-1 text-xs text-muted">{consigna.description}</p>}
              {consigna.time && <p className="mt-1 flex items-center gap-1 text-xs text-faint"><Clock size={12} />{consigna.time}</p>}
            </div>
          )}

          <Field label={t("consignas.note", "Detalle / observación")}>
            <textarea className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60"
              rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("consignas.notePh", "Describe lo realizado...")} />
          </Field>

          {/* Photos */}
          <Field label={t("consignas.photos", "Fotos")}>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={`${p.file.name}-${p.file.size}`} className="relative h-16 w-16 overflow-hidden rounded-lg border border-line">
                  <img src={p.dataUrl} className="h-full w-full object-cover" alt="" />
                  <button onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}
                    className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white"><Trash2 size={11} /></button>
                </div>
              ))}
              <button onClick={() => photoInput.current?.click()}
                className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-line text-muted">
                <Camera size={20} />
              </button>
            </div>
          </Field>

          {/* Video */}
          <Field label={t("consignas.video", "Video (opcional)")}>
            {video ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink">
                <Video size={16} className="text-gold" /><span className="flex-1 truncate">{video.name}</span>
                <button onClick={() => setVideo(null)} className="text-muted"><Trash2 size={14} /></button>
              </div>
            ) : (
              <button onClick={() => videoInput.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3 text-sm text-muted">
                <Video size={18} /> {t("consignas.recordVideo", "Grabar video")}
              </button>
            )}
          </Field>

          {/* Audio voice-note */}
          <Field label={t("consignas.audio", "Nota de voz (opcional)")}>
            {audioUrl ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                <audio src={audioUrl} controls className="h-8 flex-1" />
                <button onClick={() => setAudio(null, null)} className="text-muted"><Trash2 size={14} /></button>
              </div>
            ) : recording ? (
              <button onClick={stopAudio} className="flex w-full items-center justify-center gap-2 rounded-lg bg-critical/15 py-3 text-sm font-semibold text-critical">
                <Square size={16} /> {t("consignas.stop", "Detener grabación")} <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-critical" />
              </button>
            ) : (
              <button onClick={startAudio} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3 text-sm text-muted">
                <Mic size={18} /> {t("consignas.recordAudio", "Grabar nota de voz")}
              </button>
            )}
          </Field>

          <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          <input ref={videoInput} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { setVideo(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
        </div>

        <div className="border-t border-line px-4 pt-3" style={footerStyle}>
          {error && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-critical">
              <AlertCircle size={14} className="shrink-0" />{error}
            </p>
          )}
          <button onClick={submit} disabled={busy}
            className="btn-xl w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} />{t("consignas.markDone", "Marcar como hecha")}</>}
          </button>
        </div>
      </div>
    </IonModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}
