import { ReactNode, useState } from "react";
import {
  IonPage,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  isPlatform,
} from "@ionic/react";
import { useHistory } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

// The app runs in Material mode globally (setupIonicReact mode: "md"), but the
// MD pull-to-refresh is unreliable and non-native inside the iOS WKWebView. On
// iOS we render the refresher in "ios" mode so it uses the native rubber-band
// pull + the chevron→crescent spinner. md everywhere else.
const REFRESH_MODE: "ios" | "md" = isPlatform("ios") ? "ios" : "md";

/**
 * Standard screen scaffold: an Ionic page with a dark, custom header and a
 * scrollable navy content area. Optional pull-to-refresh.
 *
 * Two header modes:
 *  • Default — a compact title bar (used by most screens).
 *  • Large title — pass `largeTitle` for an iOS-style collapsing large title:
 *    a big title at rest that shrinks into a blurred sticky bar as you scroll
 *    (reproduced with CSS so it behaves the same on iOS, Android and web).
 *
 * Pass `back` on pushed sub-screens to show a top-left back button.
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
  largeTitle,
  largeSubtitle,
  compactTitle,
  avatar,
  header,
}: {
  title?: string;
  titleClassName?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  back?: boolean;
  backHref?: string;
  /** When set, renders the collapsing iOS-style large title instead of `title`. */
  largeTitle?: string;
  largeSubtitle?: string;
  /** Title shown in the collapsed sticky bar (defaults to `largeTitle`). */
  compactTitle?: string;
  /** Optional leading element (e.g. avatar) shown in the collapsed bar. */
  avatar?: ReactNode;
  /** Fully custom header node (takes precedence over title/largeTitle). */
  header?: ReactNode;
}) {
  const history = useHistory();
  const goBack = () => {
    if (backHref) history.push(backHref);
    else if (history.length > 1) history.goBack();
    else history.push("/guard/dashboard");
  };

  const [scrollTop, setScrollTop] = useState(0);
  const refresher = onRefresh && (
    <IonRefresher
      slot="fixed"
      mode={REFRESH_MODE}
      pullFactor={0.6}
      pullMin={70}
      pullMax={180}
      onIonRefresh={async (e) => {
        try {
          await onRefresh();
        } finally {
          e.detail.complete();
        }
      }}
    >
      <IonRefresherContent
        pullingIcon={REFRESH_MODE === "ios" ? "lines" : "circular"}
        refreshingSpinner={REFRESH_MODE === "ios" ? "lines" : "circular"}
      />
    </IonRefresher>
  );

  // -------------------------------------------------- Custom header mode
  if (header) {
    return (
      <IonPage>
        <IonContent forceOverscroll={REFRESH_MODE === "ios"}>
          {refresher}
          <div className="safe-top">{header}</div>
          <div className="px-4 pb-6 pt-1 safe-bottom">{children}</div>
        </IonContent>
      </IonPage>
    );
  }

  // -------------------------------------------------- Large-title mode
  if (largeTitle) {
    const COLLAPSE = 52; // px of scroll over which the large title collapses
    const p = Math.min(1, Math.max(0, scrollTop / COLLAPSE)); // 0 open → 1 collapsed
    return (
      <IonPage>
        <IonContent
          scrollEvents
          forceOverscroll={REFRESH_MODE === "ios"}
          onIonScroll={(e) => setScrollTop(e.detail.scrollTop)}
        >
          {refresher}

          {/* Sticky collapsed bar — blurs in + reveals the compact title on scroll */}
          <div
            className="safe-top sticky top-0 z-30"
            style={{
              background: `rgba(10,14,22,${0.55 + 0.4 * p})`,
              backdropFilter: p > 0.02 ? "blur(14px)" : "none",
              WebkitBackdropFilter: p > 0.02 ? "blur(14px)" : "none",
              borderBottom: `1px solid rgba(31,38,48,${p})`,
            }}
          >
            <div className="flex h-12 items-center justify-between gap-3 px-4">
              <div
                className="flex min-w-0 items-center gap-2.5"
                style={{ opacity: p, transform: `translateY(${(1 - p) * 6}px)` }}
              >
                {avatar}
                <span className="truncate text-[17px] font-semibold text-ink">
                  {compactTitle || largeTitle}
                </span>
              </div>
              {right && <div className="shrink-0">{right}</div>}
            </div>
          </div>

          {/* Large title — scrolls away as you scroll up */}
          <div
            className="px-4 pb-2 pt-1"
            style={{ opacity: 1 - p, transform: `translateY(${-p * 6}px)` }}
          >
            <h1 className="text-[32px] font-extrabold leading-[1.08] tracking-tight text-ink">
              {largeTitle}
            </h1>
            {largeSubtitle && <p className="mt-1.5 text-sm text-muted">{largeSubtitle}</p>}
          </div>

          <div className="px-4 pb-6 pt-1 safe-bottom">{children}</div>
        </IonContent>
      </IonPage>
    );
  }

  // -------------------------------------------------- Default compact header
  return (
    <IonPage>
      <IonContent forceOverscroll={REFRESH_MODE === "ios"}>
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

        {refresher}

        <div className="px-4 py-4 safe-bottom">{children}</div>
      </IonContent>
    </IonPage>
  );
}
