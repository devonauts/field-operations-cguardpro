import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, CheckCircle2, Clock } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { taskService, type GuardTask } from "@/lib/services";
import { useIonToast } from "@ionic/react";

const PRIORITY_CLS: Record<string, string> = {
  alta: "text-red-400",
  media: "text-gold",
  baja: "text-white/50",
};

function fmtDeadline(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function GuardTasks() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => taskService.list());
  const [busy, setBusy] = useState<string | null>(null);
  const [present] = useIonToast();

  const tasks: GuardTask[] = data || [];

  const complete = async (task: GuardTask) => {
    const notes = window.prompt("Nota de cumplimiento (opcional):") ?? undefined;
    setBusy(task.id);
    try {
      await taskService.complete(task.id, { notes });
      present({ message: "Tarea completada", duration: 1800, position: "top" });
      reload();
    } catch {
      present({ message: "No se pudo completar la tarea", duration: 2400, position: "top" });
    } finally {
      setBusy(null);
    }
  };

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
        <div className="space-y-3">
          {tasks.map((task) => {
            const deadline = fmtDeadline(task.dateToDoTheTask);
            return (
              <Card key={task.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{task.taskToDo}</p>
                    <p className="mt-0.5 text-xs text-white/50">
                      {task.taskBelongsToStation?.stationName || ""}
                      {task.priority ? (
                        <span className={`ml-2 ${PRIORITY_CLS[task.priority] || "text-white/50"}`}>
                          · {task.priority}
                        </span>
                      ) : null}
                    </p>
                    {deadline && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-white/40">
                        <Clock size={12} /> {deadline}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => complete(task)}
                    disabled={busy === task.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-gold/15 px-3 py-2 text-xs font-semibold text-gold disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    {busy === task.id ? "…" : "Completar"}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
