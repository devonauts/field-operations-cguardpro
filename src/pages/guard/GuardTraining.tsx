import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import {
  GraduationCap,
  Award,
  BookOpen,
  ChevronRight,
  CheckCircle2,
  Clock,
  Trophy,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { fmtDate } from "@/lib/format";
import fb from "@/lib/feedback";
import {
  trainingService,
  type TrainingCourseRow,
  type TrainingCertificateRow,
} from "@/lib/services";

type Tab = "courses" | "achievements";

const STATUS_COLOR: Record<TrainingCourseRow["status"], string> = {
  assigned: "#9aa4b2",
  in_progress: "#d4a017",
  completed: "#22c55e",
  expired: "#ef4444",
};

export default function GuardTraining() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("courses");

  return (
    <Screen title={t("training.title")} subtitle={t("training.subtitle")}>
      <div className="mb-4 flex rounded-2xl bg-surface-2 p-1">
        <SegBtn
          active={tab === "courses"}
          onClick={() => {
            fb.select();
            setTab("courses");
          }}
          icon={<BookOpen size={16} />}
          label={t("training.tabs.courses")}
        />
        <SegBtn
          active={tab === "achievements"}
          onClick={() => {
            fb.select();
            setTab("achievements");
          }}
          icon={<Award size={16} />}
          label={t("training.tabs.achievements")}
        />
      </div>

      {tab === "courses" ? <CoursesTab /> : <AchievementsTab />}
    </Screen>
  );
}

function SegBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition ${
        active ? "bg-navy-50 text-ink shadow" : "text-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ----------------------------------------------------------------- Courses */
function CoursesTab() {
  const { t } = useTranslation();
  const history = useHistory();
  const { data, loading, reload } = useAsync(() =>
    trainingService.myCourses().catch(() => ({ rows: [], count: 0 })),
  );
  const rows = data?.rows || [];

  if (loading) return <Loader />;
  if (!rows.length) {
    return (
      <EmptyState
        icon={<GraduationCap size={28} />}
        title={t("training.empty")}
        hint={t("training.emptyHint")}
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((c) => (
        <CourseCard
          key={c.id}
          course={c}
          onOpen={() => {
            fb.tap();
            history.push(`/guard/training/${c.id}`);
          }}
        />
      ))}
      <button
        onClick={() => {
          fb.tap();
          reload();
        }}
        className="mx-auto block pt-1 text-xs text-muted"
      >
        {t("common.refresh")}
      </button>
    </div>
  );
}

function CourseCard({
  course,
  onOpen,
}: {
  course: TrainingCourseRow;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const color = STATUS_COLOR[course.status];
  const pct = Math.max(0, Math.min(100, course.progressPercentage || 0));
  const cta =
    course.status === "completed"
      ? t("training.review")
      : course.status === "in_progress"
        ? t("training.continue")
        : t("training.start");

  return (
    <Card className="p-4" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {course.courseTitle}
          </p>
          <span
            className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
            style={{ color, borderColor: `${color}55`, background: `${color}14` }}
          >
            {course.status === "completed" ? (
              <CheckCircle2 size={11} />
            ) : (
              <Clock size={11} />
            )}
            {t(`training.status.${course.status}`)}
          </span>
        </div>
        <ChevronRight size={18} className="mt-0.5 shrink-0 text-low" />
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: "width 500ms ease" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{t("training.progress", { pct })}</span>
        <span className="font-semibold text-gold">{cta}</span>
      </div>
      {course.status !== "completed" && course.dueDate && (
        <p className="mt-1 text-[11px] text-muted">
          {t("training.due", { date: fmtDate(course.dueDate) })}
        </p>
      )}
      {course.status === "completed" && course.completedAt && (
        <p className="mt-1 text-[11px] text-online">
          {t("training.completedOn", { date: fmtDate(course.completedAt) })}
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ Achievements */
function AchievementsTab() {
  const { t } = useTranslation();
  const history = useHistory();
  const { data, loading } = useAsync(() =>
    trainingService.certificates().catch(() => ({ rows: [], count: 0 })),
  );
  const rows = data?.rows || [];
  const totalPoints = useMemo(
    () => rows.reduce((s, c) => s + (c.pointsValue || 0), 0),
    [rows],
  );

  if (loading) return <Loader />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat
          icon={<Trophy size={16} />}
          value={totalPoints}
          label={t("training.achievements.totalPoints")}
          accent
        />
        <MiniStat
          icon={<Award size={16} />}
          value={rows.length}
          label={t("training.achievements.certificatesEarned")}
        />
        <MiniStat
          icon={<CheckCircle2 size={16} />}
          value={rows.length}
          label={t("training.achievements.coursesDone")}
        />
      </div>

      {!rows.length ? (
        <EmptyState
          icon={<Award size={28} />}
          title={t("training.achievements.empty")}
          hint={t("training.achievements.emptyHint")}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <CertCard
              key={c.id}
              cert={c}
              onOpen={() => {
                fb.tap();
                history.push(`/guard/training/certificate/${c.id}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <Card className="flex flex-col items-center p-3 text-center">
      <span className={accent ? "text-gold" : "text-muted"}>{icon}</span>
      <span className={`mt-1 text-2xl font-bold ${accent ? "text-gold" : "text-ink"}`}>
        {value}
      </span>
      <span className="mt-0.5 text-[10px] leading-tight text-muted">{label}</span>
    </Card>
  );
}

function CertCard({
  cert,
  onOpen,
}: {
  cert: TrainingCertificateRow;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex items-center gap-3 p-4" onClick={onOpen}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
        <Award size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{cert.courseTitle}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {t("training.achievements.serial", { serial: cert.serialNumber })}
        </p>
        <p className="text-[11px] text-muted">
          {t("training.achievements.issuedOn", { date: fmtDate(cert.issuedAt) })}
        </p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-low" />
    </Card>
  );
}
