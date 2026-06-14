import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState, ScoreRing } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardService } from "@/lib/services";
import fb from "@/lib/feedback";

interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
}

interface QuizResult {
  scorePct: number;
  correctCount: number;
  total: number;
  passed: boolean;
  passPct: number;
}

export default function GuardQuiz() {
  const { t } = useTranslation();
  const { data, loading, reload } = useAsync(() =>
    guardService.quiz().catch(() => null),
  );
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  // Quiz start time: stamped when the question set first arrives and re-stamped
  // on each reload() (retake). Explicit ref decouples it from render memoization.
  const startedAt = useRef(new Date().toISOString());
  const stamped = useRef(false);
  useEffect(() => {
    if (data && !stamped.current) {
      startedAt.current = new Date().toISOString();
      stamped.current = true;
    }
  }, [data]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const quiz = data && data.hasQuiz ? data : null;
  const questions: QuizQuestion[] = quiz?.questions || [];
  const allAnswered =
    questions.length > 0 &&
    questions.every((q) => answers[q.id] !== undefined);

  const submit = async () => {
    if (!quiz || !allAnswered || busy) return;
    fb.press();
    setBusy(true);
    setError(null);
    try {
      const res = await guardService.submitQuiz({
        bankId: quiz.bankId,
        stationId: quiz.stationId,
        startedAt: startedAt.current,
        answers: questions.map((q) => ({
          questionId: q.id,
          chosenIndex: answers[q.id],
        })),
      });
      if (!mounted.current) return;
      setResult(res as QuizResult);
      if ((res as QuizResult).passed) fb.success();
      else fb.error();
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || "error");
      fb.error();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const retake = () => {
    fb.tap();
    setResult(null);
    setAnswers({});
    stamped.current = false; // re-stamp start time when the new question set loads
    reload();
  };

  return (
    <Screen back title={t("quiz.title")} subtitle={t("quiz.subtitle")}>
      {loading ? (
        <Loader />
      ) : result ? (
        <ResultView result={result} onRetake={retake} />
      ) : !quiz ? (
        <EmptyState
          icon={<ClipboardCheck size={28} />}
          title={t("quiz.none")}
        />
      ) : (
        <div className="space-y-3">
          {quiz.stationName && (
            <p className="text-xs text-muted">
              {t("quiz.forStation", { station: quiz.stationName })}
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
                          selected
                            ? "border-gold bg-gold text-navy"
                            : "border-line"
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
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              t("quiz.submit")
            )}
          </button>
        </div>
      )}
    </Screen>
  );
}

function ResultView({
  result,
  onRetake,
}: {
  result: QuizResult;
  onRetake: () => void;
}) {
  const { t } = useTranslation();
  const color = result.passed ? "#22c55e" : "#ef4444";
  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center p-6">
        <ScoreRing score={result.scorePct} color={color} label={t("quiz.score")} />
        <span
          className="mt-4 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ color, borderColor: `${color}66`, background: `${color}14` }}
        >
          {result.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {result.passed ? t("quiz.passed") : t("quiz.failed")}
        </span>
        <p className="mt-3 text-xs text-muted">
          {t("quiz.resultDetail", {
            correct: result.correctCount,
            total: result.total,
          })}
        </p>
      </Card>
      <button
        onClick={onRetake}
        className="btn-xl w-full border border-line text-ink active:bg-surface-2"
      >
        {t("quiz.retake")}
      </button>
    </div>
  );
}
