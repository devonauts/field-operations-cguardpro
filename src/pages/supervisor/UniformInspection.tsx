import { useState } from "react";
import { IonModal } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { Shirt, Star, X, Loader2, Search } from "lucide-react";
import { Screen } from "@/components/Screen";
import { Card, Loader, EmptyState, Avatar } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { guardsService, performanceService } from "@/lib/services";
import { fb } from "@/lib/feedback";

export default function UniformInspection() {
  const { t } = useTranslation();
  const { data, loading } = useAsync(() =>
    guardsService.list({ limit: "200" }).catch(() => ({ rows: [], count: 0 })),
  );
  const guards = (data?.rows as any[]) || [];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const filtered = query
    ? guards.filter((g) =>
        String(g.fullName || "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : guards;

  return (
    <Screen title={t("uniform.title")} subtitle={t("uniform.subtitle")}>
      {loading ? (
        <Loader />
      ) : guards.length === 0 ? (
        <EmptyState icon={<Shirt size={28} />} title={t("uniform.noGuards")} />
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("uniform.searchGuard")}
              className="w-full rounded-xl border border-line bg-surface py-3 pl-9 pr-4 text-sm text-ink outline-none focus:border-gold/60"
            />
          </div>
          {filtered.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                fb.tap();
                setSelected(g);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left active:bg-surface-2"
            >
              <Avatar name={g.fullName} />
              <span className="flex-1 text-sm font-medium text-ink">
                {g.fullName}
              </span>
              <Star size={16} className="text-gold" />
            </button>
          ))}
        </div>
      )}

      <RateModal
        guard={selected}
        onClose={() => setSelected(null)}
        onSaved={() => setSelected(null)}
      />
    </Screen>
  );
}

function RateModal({
  guard,
  onClose,
  onSaved,
}: {
  guard: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [stars, setStars] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStars(0);
    setNotes("");
    setError(null);
  };

  const submit = async () => {
    if (!guard || stars < 1 || busy) return;
    setBusy(true);
    setError(null);
    fb.press();
    try {
      await performanceService.createInspection({
        securityGuardId: guard.id,
        rating: stars * 20, // 1..5 stars → 20..100
        stars,
        notes: notes || undefined,
      });
      fb.success();
      reset();
      onSaved();
    } catch (e: any) {
      fb.error();
      setError(e?.message || "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonModal
      isOpen={!!guard}
      onDidDismiss={() => {
        reset();
        onClose();
      }}
      initialBreakpoint={1}
      breakpoints={[0, 1]}
    >
      <div className="flex h-full flex-col bg-navy safe-bottom">
        <div className="safe-top flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            {t("uniform.rate", { name: guard?.fullName || "" })}
          </h2>
          <button
            onClick={() => {
              fb.tap();
              onClose();
            }}
            className="rounded-full p-1.5 text-muted"
          >
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          <div>
            <label className="label-eyebrow mb-2 block">
              {t("uniform.rating")}
            </label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    fb.select();
                    setStars(n);
                  }}
                  className="rounded-full"
                >
                  <Star
                    size={36}
                    className={
                      n <= stars ? "text-gold" : "text-line"
                    }
                    fill={n <= stars ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-eyebrow mb-1.5 block">
              {t("uniform.notes")}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-gold/60"
            />
          </div>
          {error && <p className="text-sm text-critical">{error}</p>}
        </div>
        <div className="border-t border-line px-4 py-3">
          <button
            onClick={submit}
            disabled={busy || stars < 1}
            className="btn-xl w-full bg-gold-strong text-navy active:bg-gold-hover disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              t("uniform.save")
            )}
          </button>
        </div>
      </div>
    </IonModal>
  );
}
