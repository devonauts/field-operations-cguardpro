import { ReactNode } from "react";
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * Standard screen scaffold: an Ionic page with a dark, custom header and a
 * scrollable navy content area. Optional pull-to-refresh.
 *
 * Pass `back` on pushed sub-screens to show a top-left back button. It returns
 * to the previous screen (or `backHref` / the dashboard if there's no history).
 */
export function Screen({
  title,
  titleClassName = "truncate text-xl",
  subtitle,
  right,
  children,
  onRefresh,
  back,
  backHref,
}: {
  title: string;
  titleClassName?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  back?: boolean;
  backHref?: string;
}) {
  const history = useHistory();
  const goBack = () => {
    if (backHref) history.push(backHref);
    else if (history.length > 1) history.goBack();
    else history.push("/guard/dashboard");
  };

  return (
    <IonPage>
      <IonContent>
        {/* Custom header (Tailwind, matches Figma) */}
        <div className="safe-top bg-navy-50 border-b border-line">
          <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3">
            <div className="flex min-w-0 items-start gap-1.5">
              {back && (
                <button
                  onClick={goBack}
                  aria-label="Atrás"
                  className="-ml-1.5 mt-0.5 shrink-0 rounded-full p-1.5 text-ink active:bg-white/10"
                >
                  <ChevronLeft size={22} />
                </button>
              )}
              <div className="min-w-0">
                <h1 className={`font-bold text-ink ${titleClassName}`}>{title}</h1>
                {subtitle && (
                  <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
                )}
              </div>
            </div>
            {right && <div className="shrink-0">{right}</div>}
          </div>
        </div>

        {onRefresh && (
          <IonRefresher
            slot="fixed"
            onIonRefresh={async (e) => {
              try {
                await onRefresh();
              } finally {
                e.detail.complete();
              }
            }}
          >
            <IonRefresherContent />
          </IonRefresher>
        )}

        <div className="px-4 py-4 safe-bottom">{children}</div>
      </IonContent>
    </IonPage>
  );
}
