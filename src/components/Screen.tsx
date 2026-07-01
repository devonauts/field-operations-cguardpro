import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
 * Screen DEPTH MODEL (one consistent hierarchy across the app):
 *  • TAB ROOTS — the bottom-tab destinations (Dashboard, Patrol/Training,
 *    Schedule, Messages, Profile). Pass `root` → NO back button (you switch
 *    roots via the tab bar, you never "go back" from one).
 *  • DETAIL / SUB-PAGES — anything pushed on top of a root (a thread, a course,
 *    an incident, the shift detail…). These show a back button by DEFAULT, so a
 *    pushed screen always has a way back. `back` forces it explicitly.
 * Rule of thumb: if it's reachable from the tab bar it's a root; if it's pushed
 * via history.push it's a detail. Never both.
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
  root,
  largeTitle,
  largeSubtitle,
  compactTitle,
  avatar,
  header,
  fill,
  sheet,
}: {
  title?: string;
  titleClassName?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  back?: boolean;
  backHref?: string;
  /**
   * Tab-root screens (the bottom-tab destinations) pass `root` to HIDE the back
   * button. Every other screen is a pushed sub-page and shows a back button by
   * default — so navigation always has a way back.
   */
  root?: boolean;
  /** Full-height, non-scrolling page (the child owns its own scroll/layout — e.g. chat). */
  fill?: boolean;
  /** When set, renders the collapsing iOS-style large title instead of `title`. */
  largeTitle?: string;
  largeSubtitle?: string;
  /** Title shown in the collapsed sticky bar (defaults to `largeTitle`). */
  compactTitle?: string;
  /** Optional leading element (e.g. avatar) shown in the collapsed bar. */
  avatar?: ReactNode;
  /** Fully custom header node (takes precedence over title/largeTitle). */
  header?: ReactNode;
  /** Present this page with a vertical slide-up (like a sheet) instead of the
   *  horizontal push — see pageTransition. Kept a routed page so deep-links work. */
  sheet?: boolean;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  // Marks the .ion-page so pageTransition slides it up from the bottom.
  const pageAttrs = sheet ? { "data-sheet-transition": "true" } : {};
  // Sub-pages show a back button by default; only tab roots opt out via `root`.
  const showBack = back === true || !root;
  const goBack = () => {
    if (backHref) history.push(backHref);
    else if (history.length > 1) history.goBack();
    else history.push("/guard/dashboard");
  };

  // Large-title collapse only needs the 0..52px range; clamp + rAF-throttle so we
  // re-render at most once per frame and never once the header is fully collapsed.
  const COLLAPSE = 52; // px of scroll over which the large title collapses
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRafRef = useRef<number | null>(null);
  const onScroll = useCallback((e: CustomEvent<{ scrollTop: number }>) => {
    const next = Math.min(COLLAPSE, Math.max(0, e.detail.scrollTop));
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop((prev) => (prev === next ? prev : next));
    });
  }, []);
  useEffect(() => () => {
    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

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
      <IonPage {...pageAttrs}>
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
    const p = Math.min(1, Math.max(0, scrollTop / COLLAPSE)); // 0 open → 1 collapsed
    return (
      <IonPage {...pageAttrs}>
        <IonContent
          scrollEvents
          forceOverscroll={REFRESH_MODE === "ios"}
          onIonScroll={onScroll}
        >
          {refresher}

          {/* Sticky collapsed bar — blurs in + reveals the compact title on scroll */}
          <div
            className="safe-top sticky top-0 z-30"
            style={{
              background: `color-mix(in srgb, var(--background) ${
                (0.55 + 0.4 * p) * 100
              }%, transparent)`,
              backdropFilter: p > 0.02 ? "blur(14px)" : "none",
              WebkitBackdropFilter: p > 0.02 ? "blur(14px)" : "none",
              borderBottom: `1px solid color-mix(in srgb, var(--line) ${
                p * 100
              }%, transparent)`,
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

  // -------------------------------------------------- Fill mode (full-height, child owns scroll — e.g. chat)
  // IonContent's scroll part is made a flex column via `.chat-fill::part(scroll)`
  // in index.css, so the header sits at the top and the content (flex-1) fills the
  // rest reliably. A plain height:100% child of IonContent does NOT resolve, which
  // is what previously collapsed the chat to zero height.
  if (fill) {
    return (
      <IonPage {...pageAttrs}>
        <IonContent className="chat-fill" forceOverscroll={false}>
          <div className="safe-top bg-surface-2 border-b border-line shrink-0">
            <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3">
              <div className="flex min-w-0 items-start gap-1.5">
                {showBack && (
                  <button
                    onClick={goBack}
                    aria-label={t("aria.back", "Atrás")}
                    className="pressable -ml-1.5 mt-0.5 shrink-0 rounded-full p-1.5 text-ink active:bg-surface-2"
                  >
                    <ChevronLeft size={22} />
                  </button>
                )}
                <div className="min-w-0">
                  <h1 className={`font-bold text-ink ${titleClassName}`}>{title}</h1>
                  {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
                </div>
              </div>
              {right && <div className="shrink-0">{right}</div>}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col bg-background">{children}</div>
        </IonContent>
      </IonPage>
    );
  }

  // -------------------------------------------------- Default compact header
  return (
    <IonPage {...pageAttrs}>
      <IonContent forceOverscroll={REFRESH_MODE === "ios"}>
        <div className="safe-top bg-surface-2 border-b border-line">
          <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3">
            <div className="flex min-w-0 items-start gap-1.5">
              {showBack && (
                <button
                  onClick={goBack}
                  aria-label={t("aria.back", "Atrás")}
                  className="-ml-1.5 mt-0.5 shrink-0 rounded-full p-1.5 text-ink active:bg-surface-2"
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
