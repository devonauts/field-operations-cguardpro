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

/** Semantic feedback — call these from UI interactions. */
export const fb = {
  /** Light tap (nav rows, minor buttons). Haptic only. */
  tap() {
    impact(ImpactStyle.Light);
  },
  /** Selection tick (tab switch, segmented control). */
  select() {
    impact(ImpactStyle.Light);
  },
  /** A meaningful press (primary/danger action) — medium haptic + soft click. */
  press() {
    impact(ImpactStyle.Medium);
    if (soundsEnabled()) playTap();
  },
  /** Success confirmation — success haptic + ascending chime. */
  success() {
    notify(NotificationType.Success);
    if (soundsEnabled()) playSuccess();
  },
  /** Error/failure — error haptic + descending tone. */
  error() {
    notify(NotificationType.Error);
    if (soundsEnabled()) playError();
  },
  /** Warning — warning haptic. */
  warning() {
    notify(NotificationType.Warning);
  },
  impactLight() {
    impact(ImpactStyle.Light);
  },
  impactMedium() {
    impact(ImpactStyle.Medium);
  },
  impactHeavy() {
    impact(ImpactStyle.Heavy);
  },
};

export default fb;
