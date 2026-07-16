import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, CheckCircle2, Clock, Camera, Images, X, Loader2, ChevronRight, CalendarCheck } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, EmptyState, ErrorState, SkeletonList, Sheet } from "@/components/ui";
import { Button, StatusPill, type Tone } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import { taskService, type GuardTask } from "@/lib/services";
import { compressImage, takeNativePhoto, isNative, CapturedImage } from "@/lib/capture";
import fb from "@/lib/feedback";
import { useIonToast } from "@ionic/react";

const PRIORITY_TONE: Record<string, Tone> = {
  alta: "red",
  media: "amber",
  baja: "neutral",
};

function fmtDeadline(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function GuardTasks() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => taskService.list());
  const [active, setActive] = useState<GuardTask | null>(null);
  const [present] = useIonToast();

  const tasks: GuardTask[] = data || [];

  return (
    <Screen
      title={t("tasks.title", "Tareas del turno")}
      subtitle={t("tasks.subtitle", "Tareas solicitadas por el cliente para tu puesto")}
      onRefresh={reload}
    >
      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : tasks.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={28} />} title={t("tasks.empty", "Sin tareas pendientes")} />
      ) : (
        <div className="stagger space-y-3">
          {tasks.map((task) => {
            const deadline = fmtDeadline(task.dateToDoTheTask);
            const done = task.wasItDone === true || task.status === "completed";
            return (
              <Card key={task.id} className="p-0 overflow-hidden">
                {/* Whole card is tappable → opens the task detail (read-only when done). */}
                <button
                  onClick={() => { fb.tap(); setActive(task); }}
                  className="pressable flex w-full items-start justify-between gap-4 p-6 text-left"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{task.taskToDo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {task.taskBelongsToStation?.stationName ? (
                        <span className="truncate">{task.taskBelongsToStation.stationName}</span>
                      ) : null}
                      {task.priority ? (
                        <StatusPill tone={PRIORITY_TONE[task.priority] || "neutral"} dot={false}>
                          {task.priority}
                        </StatusPill>
                      ) : null}
                      <StatusPill tone={done ? "green" : "amber"} dot>
                        {done ? t("tasks.statusDone", "Completada") : t("tasks.statusPending", "Pendiente")}
                      </StatusPill>
                    </p>
                    {deadline && (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
                        <Clock size={12} /> {deadline}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={18} className="mt-0.5 shrink-0 text-faint" />
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {active && (
        <TaskDetailSheet
          task={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            present({ message: t("tasks.completed", "Tarea completada"), duration: 1800, position: "top" });
            reload();
          }}
        />
      )}
    </Screen>
  );
}

/* ----------------------- task detail / completion sheet ----------------------- */
function TaskDetailSheet({
  task,
  onClose,
  onDone,
}: {
  task: GuardTask;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const done = task.wasItDone === true || task.status === "completed";
  const refImg = task.imageOptional?.[0]?.downloadUrl || task.imageOptional?.[0]?.publicUrl || "";
  const doneImg = task.taskCompletedImage?.[0]?.downloadUrl || task.taskCompletedImage?.[0]?.publicUrl || "";
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<CapturedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const webResolver = useRef<((file: File | null) => void) | null>(null);

  const capture = (source: "camera" | "gallery"): Promise<CapturedImage | null> => {
    if (isNative()) return takeNativePhoto(source).catch(() => null);
    return new Promise((resolve) => {
      webResolver.current = async (file) => {
        if (!file) return resolve(null);
        try { resolve(await compressImage(file)); } catch { resolve(null); }
      };
      (source === "camera" ? cameraInput : galleryInput).current?.click();
    });
  };
  const onWebPick = (file?: File | null) => {
    const r = webResolver.current;
    webResolver.current = null;
    r?.(file || null);
  };
  const addPhoto = async (source: "camera" | "gallery") => {
    const img = await capture(source);
    if (img) setPhotos((p) => [...p, img]);
  };
  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!notes.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Upload optional photos first; a failed upload is skipped, never blocks
      // saving the report.
      let photo: any[] | undefined;
      if (photos.length) {
        const out: any[] = [];
        for (const p of photos) {
          try {
            const up = await taskService.uploadPhoto(p.file);
            out.push({ ...up, new: true });
          } catch {
            /* skip a failed upload, keep the rest */
          }
        }
        photo = out.length ? out : undefined;
      }
      await taskService.complete(task.id, { notes: notes.trim(), photo });
      fb.success();
      onDone();
    } catch {
      setError(t("tasks.completeError", "No se pudo completar la tarea. Intenta de nuevo."));
      fb.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={done ? t("tasks.detailTitle", "Detalle de la tarea") : t("tasks.completeTitle", "Completar tarea")}>
      {/* Task description + meta */}
      <p className="mb-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm font-medium text-ink">
        {task.taskToDo}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        {task.taskBelongsToStation?.stationName && <span className="truncate">{task.taskBelongsToStation.stationName}</span>}
        {task.priority && <StatusPill tone={PRIORITY_TONE[task.priority] || "neutral"} dot={false}>{task.priority}</StatusPill>}
        {task.dateToDoTheTask && <span className="flex items-center gap-1"><Clock size={12} /> {fmtDeadline(task.dateToDoTheTask)}</span>}
      </div>

      {/* Reference image attached by the client, if any */}
      {refImg ? (
        <div className="mb-4">
          <label className="label-eyebrow mb-1.5 block">{t("tasks.reference", "Imagen de referencia")}</label>
          <a href={refImg} target="_blank" rel="noopener noreferrer">
            <img src={refImg} alt="" className="w-full rounded-xl border border-line object-cover" />
          </a>
        </div>
      ) : null}

      {done ? (
        /* Read-only completion detail */
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <CalendarCheck size={16} className="text-gold" />
            {t("tasks.completedOn", "Completada")}
            {task.dateCompletedTask ? ` · ${fmtDeadline(task.dateCompletedTask)}` : ""}
          </p>
          {task.completionNotes ? (
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{task.completionNotes}</p>
          ) : (
            <p className="mt-1.5 text-sm text-faint">{t("tasks.noNotes", "Sin notas")}</p>
          )}
          {doneImg ? (
            <a href={doneImg} target="_blank" rel="noopener noreferrer" className="mt-3 block">
              <img src={doneImg} alt="" className="w-full rounded-xl border border-line object-cover" />
            </a>
          ) : null}
        </div>
      ) : (
        <>
      <label className="label-eyebrow mb-1.5 block">{t("tasks.whatDidYouDo", "¿Qué realizaste?")}</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder={t("tasks.notesPlaceholder", "Describe lo que hiciste…")}
        className="mb-4 w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-ink placeholder:text-faint outline-none focus:border-gold/60"
      />

      <label className="label-eyebrow mb-1.5 block">{t("tasks.photosOptional", "Fotos (opcional)")}</label>
      {photos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-20 w-20">
              <img src={p.dataUrl} alt="" className="h-full w-full rounded-xl border border-line object-cover" />
              <button
                onClick={() => removePhoto(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-white"
                aria-label={t("app.remove", "Quitar")}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => addPhoto("camera")}
          className="pressable flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold-soft text-sm font-semibold text-gold"
        >
          <Camera size={18} className="shrink-0" />
          {t("app.takePhoto", "Tomar foto")}
        </button>
        <button
          onClick={() => addPhoto("gallery")}
          className="pressable flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-muted"
        >
          <Images size={18} className="shrink-0" />
          {t("app.fromGallery", "Galería")}
        </button>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onWebPick(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => { onWebPick(e.target.files?.[0]); e.target.value = ""; }} />

      {error && <p className="mb-3 text-sm text-critical">{error}</p>}

      <Button variant="primary" full disabled={busy || !notes.trim()} onClick={submit}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} />{t("tasks.markDone", "Marcar como completada")}</>}
      </Button>
        </>
      )}
    </Sheet>
  );
}
