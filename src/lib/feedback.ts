/**
 * Unified tactile + audible feedback for the worker app.
 *
 * Haptics use @capacitor/haptics on device, falling back to navigator.vibrate on
 * the web. Sounds are synthesized via the Web Audio API (see shutter.ts) — no
 * audio assets shipped. Everything is best-effort: a failure (no AudioContext,
 * autoplay policy, web platform) is swallowed and never blocks the UI.
 *
 * Both channels respect a user toggle (Profile → "Sonidos y vibración"),
 * defaulting ON.
 */
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import { playSuccess, playError, playTap } from "./shutter";

const SOUND_KEY = "fbSounds";
const HAPTIC_KEY = "fbHaptics";

const isNative = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}
export function setSoundsEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTIC_KEY) !== "0";
  } catch {
    return true;
  }
}
export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(HAPTIC_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function impact(style: ImpactStyle) {
  if (!hapticsEnabled()) return;
  try {
    if (isNative) {
      Haptics.impact({ style }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(style === ImpactStyle.Heavy ? 28 : style === ImpactStyle.Medium ? 16 : 9);
    }
  } catch {
    /* ignore */
  }
}

function notify(type: NotificationType) {
  if (!hapticsEnabled()) return;
  try {
    if (isNative) {
      Haptics.notification({ type }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(type === NotificationType.Error ? [10, 50, 10] : [8, 30]);
    }
  } catch {
    /* ignore */
  }
}

// Timestamp of the last feedback we emitted (any channel). The global tap
// listener (initTapFeedback) reads this to avoid double-firing when a component
// already gave richer feedback (press/success/…) for the same interaction.
let lastFeedbackAt = 0;
function mark() {
  try {
    lastFeedbackAt = Date.now();
  } catch {
    /* ignore */
  }
}

/** Semantic feedback — call these from UI interactions. */
export const fb = {
  /** Light tap (nav rows, minor buttons) — light haptic + soft click. */
  tap() {
    mark();
    impact(ImpactStyle.Light);
    if (soundsEnabled()) playTap();
  },
  /** Selection tick (tab switch, segmented control) — light haptic + soft click. */
  select() {
    mark();
    impact(ImpactStyle.Light);
    if (soundsEnabled()) playTap();
  },
  /** A meaningful press (primary/danger action) — medium haptic + soft click. */
  press() {
    mark();
    impact(ImpactStyle.Medium);
    if (soundsEnabled()) playTap();
  },
  /** Success confirmation — success haptic + ascending chime. */
  success() {
    mark();
    notify(NotificationType.Success);
    if (soundsEnabled()) playSuccess();
  },
  /** Error/failure — error haptic + descending tone. */
  error() {
    mark();
    notify(NotificationType.Error);
    if (soundsEnabled()) playError();
  },
  /** Warning — warning haptic. */
  warning() {
    mark();
    notify(NotificationType.Warning);
  },
  impactLight() {
    mark();
    impact(ImpactStyle.Light);
  },
  impactMedium() {
    mark();
    impact(ImpactStyle.Medium);
  },
  impactHeavy() {
    mark();
    impact(ImpactStyle.Heavy);
  },
};

/**
 * Global tap feedback — gives EVERY button/[role=button] a light haptic + click
 * sound without wiring each handler. De-duped against explicit fb.* calls: a
 * component that already fired its own feedback (press/success/…) for the same
 * click suppresses this one, so there's never a double. Idempotent; call once.
 *
 * Runs on `click` (bubble) so it fires AFTER a component's own onClick handler —
 * meaning any explicit fb.* call has already updated `lastFeedbackAt`. Excludes
 * disabled elements, `.no-press`, and ion-tab-button (tabs feed back on change).
 */
// AbortController-based so init is idempotent AND fully cleanable — a repeated
// init (HMR / StrictMode) can never double-bind, and teardownTapFeedback() removes
// it cleanly. A stale boolean guard would leak the listener across HMR re-eval.
let tapFeedbackAbort: AbortController | null = null;
export function teardownTapFeedback(): void {
  tapFeedbackAbort?.abort();
  tapFeedbackAbort = null;
}
export function initTapFeedback(): void {
  if (tapFeedbackAbort || typeof document === "undefined") return;
  const ac = new AbortController();
  tapFeedbackAbort = ac;
  document.addEventListener(
    "click",
    (e) => {
      try {
        const target = e.target as HTMLElement | null;
        const el = target?.closest?.(
          'button, [role="button"], a[href], ion-button, ion-back-button, .pressable',
        ) as HTMLElement | null;
        if (!el) return;
        if (
          el.matches('.no-press, [disabled], [aria-disabled="true"]') ||
          el.closest("ion-tab-button")
        ) {
          return;
        }
        // A component already gave feedback for this interaction → don't double.
        if (Date.now() - lastFeedbackAt < 250) return;
        fb.tap();
      } catch {
        /* best-effort */
      }
    },
    { signal: ac.signal },
  );
}

export default fb;
