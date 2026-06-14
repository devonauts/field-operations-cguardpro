import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useParams } from "react-router-dom";
import {
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Award,
} from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState, ScoreRing } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import fb from "@/lib/feedback";
import { trainingService } from "@/lib/services";

interface QuizResult {
  scorePct: number;
  correctCount: number;
  total: number;
  passed: boolean;
  passPct: number;
  certificateId?: string | null;
}

export default function GuardCourseQuiz() {
  const { t } = useTranslation();
  const history = useHistory();
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const { data, loading, reload } = useAsync(
    () => trainingService.enrollmentDetail(enrollmentId),
    [enrollmentId],
  );
  const startedAt = useMemo(() => new Date().toISOString(), [data]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  const questions = data?.questions || [];
  const bankId = data?.quizBankId || null;
  const hasQuiz = !!data?.hasQuiz && !!bankId;
  const allAnswered =
    questions.length > 0 && questions.every((q) => answers[q.id] !== undefined);

  const submit = async () => {
    if (!bankId || !allAnswered || busy) return;
    fb.press();
    setBusy(true);
    setError(null);
    try {
      const res = await trainingService.submitQuiz(enrollmentId, {
        bankId,
        startedAt,
        answers: questions.map((q) => ({ questionId: q.id, chosenIndex: answers[q.id] })),
      });
      setResult(res as QuizResult);
      if (res.passed) fb.success();
      else fb.error();
    } catch (e: any) {
      setError(e?.message || "error");
      fb.error();
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    fb.tap();
    setResult(null);
    setAnswers({});
    reload();
  };

  return (
    <Screen
      back
      backHref={`/guard/training/${enrollmentId}`}
      title={t("training.quiz.title")}
      subtitle={t("training.quiz.subtitle")}
    >
      {loading ? (
        <Loader />
      ) : result ? (
        <ResultView
          result={result}
          onRetake={retake}
          onViewCertificate={
            result.certificateId
              ? () => {
                  fb.tap();
                  history.replace(`/guard/training/certificate/${result.certificateId}`);
                }
              : undefined
          }
        />
      ) : !hasQuiz || questions.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={28} />} title={t("training.quiz.none")} />
      ) : (
        <div className="space-y-3">
          {typeof data?.passPct === "number" && (
            <p className="text-xs text-muted">
              {t("training.quiz.passNeeded", { pct: data.passPct })}
            </p>
          )}
          {questions.map((q, qi) => (
            <Card key={q.id} className="p-4">
              <p className="text-sm font-semibold text-ink">
                {qi + 1}. {q.prompt}
              </p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => {
                  const selected = answers[q.id] === oi;
                  return (
                    <button
                      key={oi}
                      onClick={() => {
                        fb.tap();
                        setAnswers((a) => ({ ...a, [q.id]: oi }));
                      }}
                      className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border px-3.5 text-left text-sm ${
                        selected
                          ? "border-gold bg-gold/10 text-gold"
                          : "border-line text-muted active:bg-surface-2"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                          selected ? "border-gold bg-gold text-navy" : "border-line"
                        }`}
                      >
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}

          {error && <p className="text-sm text-critical">{error}</p>}

          <button
            onClick={submit}
            disabled={!allAnswered || busy}
            className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : t("training.quiz.submit")}
          </button>
        </div>
      )}
    </Screen>
  );
}

function ResultView({
  result,
  onRetake,
  onViewCertificate,
}: {
  result: QuizResult;
  onRetake: () => void;
  onViewCertificate?: () => void;
}) {
  const { t } = useTranslation();
  const color = result.passed ? "#22c55e" : "#ef4444";
  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center p-6">
        <ScoreRing score={result.scorePct} color={color} label={t("training.quiz.score")} />
        <span
          className="mt-4 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ color, borderColor: `${color}66`, background: `${color}14` }}
        >
          {result.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {result.passed ? t("training.quiz.passed") : t("training.quiz.failed")}
        </span>
        <p className="mt-3 text-xs text-muted">
          {t("training.quiz.resultDetail", {
            correct: result.correctCount,
            total: result.total,
          })}
        </p>
      </Card>

      {result.passed && onViewCertificate ? (
        <button
          onClick={onViewCertificate}
          className="btn-xl flex w-full items-center justify-center gap-2 bg-gold-strong text-navy active:bg-gold-hover"
        >
          <Award size={18} /> {t("training.quiz.viewCertificate")}
        </button>
      ) : (
        <button
          onClick={onRetake}
          className="btn-xl w-full border border-line text-ink active:bg-surface-2"
        >
          {t("training.quiz.retake")}
        </button>
      )}
    </div>
  );
}
