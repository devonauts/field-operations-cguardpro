import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  CheckCircle2,
  Loader2,
  FileText,
  ExternalLink,
  Film,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import {
  trainingService,
  type TrainingLessonView,
} from "@/lib/services";

/** Turn a YouTube/Vimeo URL into an embeddable src, else null (open externally). */
function embedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed${u.pathname}`;
    if (host.endsWith("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (host.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    /* not a parseable url */
  }
  return null;
}

const isDirectVideo = (url: string) => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);

export default function GuardLesson() {
  const { t } = useTranslation();
  const history = useHistory();
  const { enrollmentId, lessonId } = useParams<{
    enrollmentId: string;
    lessonId: string;
  }>();
  const startedAt = useRef(Date.now());
  const { data, loading } = useAsync(
    () => trainingService.enrollmentDetail(enrollmentId),
    [enrollmentId],
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const lessons = useMemo(
    () => (data?.lessons || []).slice().sort((a, b) => a.order - b.order),
    [data],
  );
  const lesson = lessons.find((l) => l.id === lessonId) || null;
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const next = idx >= 0 ? lessons[idx + 1] : undefined;
  const alreadyComplete = !!lesson?.completed || done;

  const complete = async () => {
    if (!lesson || busy || alreadyComplete) return;
    setBusy(true);
    try {
      await trainingService.completeLesson(lesson.id, {
        enrollmentId,
        timeSpentSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
      setDone(true);
      fb.success();
    } catch {
      fb.error();
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    fb.tap();
    if (next) {
      history.replace(`/guard/training/${enrollmentId}/lesson/${next.id}`);
    } else {
      history.replace(`/guard/training/${enrollmentId}`);
    }
  };

  if (loading) {
    return (
      <Screen back title={t("training.title")}>
        <Loader />
      </Screen>
    );
  }
  if (!lesson) {
    return (
      <Screen back title={t("training.title")}>
        <EmptyState icon={<FileText size={28} />} title={t("training.course.noLessons")} />
      </Screen>
    );
  }

  const resources = lesson.resources || [];

  return (
    <Screen
      back
      backHref={`/guard/training/${enrollmentId}`}
      title={lesson.title}
      subtitle={
        idx >= 0
          ? t("training.course.lessonOf", { current: idx + 1, total: lessons.length })
          : undefined
      }
    >
      <div className="space-y-4">
        {lesson.videoUrl && <VideoBlock url={lesson.videoUrl} />}

        {lesson.description && (
          <p className="text-sm leading-relaxed text-muted">{lesson.description}</p>
        )}

        {lesson.richContent && (
          <div
            className="lesson-rich text-sm leading-relaxed text-ink [&_a]:text-gold [&_a]:underline [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_img]:my-2 [&_img]:rounded-xl [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_ul]:my-2"
            // Lesson content is authored by tenant admins in the CRM (trusted within tenant).
            dangerouslySetInnerHTML={{ __html: lesson.richContent }}
          />
        )}

        {resources.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {t("training.lesson.resources")}
            </p>
            <div className="space-y-2">
              {resources.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => fb.tap()}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 active:opacity-80"
                >
                  <FileText size={18} className="shrink-0 text-gold" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {r.name || r.url}
                  </span>
                  <ExternalLink size={15} className="shrink-0 text-low" />
                </a>
              ))}
            </div>
          </div>
        )}

        {alreadyComplete ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-online/40 bg-online/10 py-3 text-sm font-semibold text-online">
              <CheckCircle2 size={18} /> {t("training.lesson.completed")}
            </div>
            <button
              onClick={goNext}
              className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover"
            >
              {next ? t("training.lesson.next") : t("training.course.lessons")}
            </button>
          </div>
        ) : (
          <button
            onClick={complete}
            disabled={busy}
            className="btn-xl flex w-full items-center justify-center gap-2 bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={18} /> {t("training.lesson.markComplete")}
              </>
            )}
          </button>
        )}
      </div>
    </Screen>
  );
}

function VideoBlock({ url }: { url: string }) {
  const { t } = useTranslation();
  const embed = embedSrc(url);

  if (embed) {
    return (
      <div className="overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          src={embed}
          title="video"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (isDirectVideo(url)) {
    return (
      <video
        src={url}
        controls
        playsInline
        className="w-full rounded-2xl bg-black"
        style={{ aspectRatio: "16 / 9" }}
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => fb.tap()}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 active:opacity-80"
    >
      <Film size={20} className="shrink-0 text-gold" />
      <span className="flex-1 text-sm font-medium text-ink">
        {t("training.lesson.watchVideo")}
      </span>
      <ExternalLink size={16} className="shrink-0 text-low" />
    </a>
  );
}
