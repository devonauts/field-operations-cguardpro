import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  PlayCircle,
  FileText,
  ClipboardCheck,
  Lock,
  Award,
  Clock,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { Button } from "@/components/ui/kit";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import {
  trainingService,
  type TrainingEnrollmentDetail,
  type TrainingLessonView,
} from "@/lib/services";

export default function GuardCourseDetail() {
  const { t } = useTranslation();
  const history = useHistory();
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const { data, loading, error, reload } = useAsync(
    () => trainingService.enrollmentDetail(enrollmentId),
    [enrollmentId],
  );

  if (loading) {
    return (
      <Screen back title={t("training.title")}>
        <SkeletonList />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen back title={t("training.title")}>
        <ErrorState onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen back title={t("training.title")}>
        <EmptyState icon={<ClipboardCheck size={28} />} title={t("training.empty")} />
      </Screen>
    );
  }

  return <CourseDetailView enrollment={data} enrollmentId={enrollmentId} history={history} />;
}

function CourseDetailView({
  enrollment,
  enrollmentId,
  history,
}: {
  enrollment: TrainingEnrollmentDetail;
  enrollmentId: string;
  history: ReturnType<typeof useHistory>;
}) {
  const { t } = useTranslation();
  const lessons = (enrollment.lessons || []).slice().sort((a, b) => a.order - b.order);
  const total = lessons.length;
  const done = lessons.filter((l) => l.completed).length;
  const pct = total ? Math.round((done / total) * 100) : enrollment.progressPercentage || 0;
  const allLessonsDone = total > 0 && done === total;

  const openLesson = (l: TrainingLessonView) => {
    fb.tap();
    history.push(`/guard/training/${enrollmentId}/lesson/${l.id}`);
  };

  return (
    <Screen
      back
      title={enrollment.courseTitle}
      subtitle={t("training.course.lessonsCount", { count: total })}
    >
      <Card className="p-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{t("training.progress", { pct })}</span>
          {enrollment.quizPassed && (
            <span className="inline-flex items-center gap-1 text-online">
              <Award size={13} /> {t("training.course.quizPassed")}
            </span>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-gold"
            style={{ width: `${pct}%`, transition: "width 500ms ease" }}
          />
        </div>
      </Card>

      <p className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {t("training.course.lessons")}
      </p>

      {total === 0 ? (
        <EmptyState icon={<FileText size={26} />} title={t("training.course.noLessons")} />
      ) : (
        <div className="space-y-2">
          {lessons.map((l, i) => (
            <Card key={l.id} className="flex items-center gap-3 p-3.5" onClick={() => openLesson(l)}>
              <span className="shrink-0">
                {l.completed ? (
                  <CheckCircle2 size={22} className="text-online" />
                ) : l.videoUrl ? (
                  <PlayCircle size={22} className="text-gold" />
                ) : (
                  <Circle size={22} className="text-low" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {i + 1}. {l.title}
                </p>
                {l.durationMinutes ? (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                    <Clock size={10} /> {t("training.course.minutes", { min: l.durationMinutes })}
                  </p>
                ) : null}
              </div>
              {l.completed && (
                <span className="shrink-0 text-[11px] font-semibold text-online">
                  {t("training.course.completedBadge")}
                </span>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Quiz gate / completion CTA */}
      {enrollment.hasQuiz ? (
        <div className="mt-5">
          {enrollment.quizPassed ? (
            <div className="flex items-center justify-center gap-2 rounded-card border border-online/40 bg-online/10 py-3 text-sm font-semibold text-online">
              <Award size={18} /> {t("training.course.courseDone")}
            </div>
          ) : !allLessonsDone ? (
            <div className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface-2 py-3 text-xs text-muted">
              <Lock size={15} /> {t("training.course.quizLocked")}
            </div>
          ) : (
            <Button
              variant="primary"
              full
              onClick={() => history.push(`/guard/training/${enrollmentId}/quiz`)}
            >
              <span className="flex items-center justify-center gap-2">
                <ClipboardCheck size={18} /> {t("training.course.takeQuiz")}
              </span>
            </Button>
          )}
        </div>
      ) : (
        allLessonsDone && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-card border border-online/40 bg-online/10 py-3 text-sm font-semibold text-online">
            <Award size={18} /> {t("training.course.courseDone")}
          </div>
        )
      )}
    </Screen>
  );
}
