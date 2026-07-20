import { createAnimation } from "@ionic/react";
import type { Animation } from "@ionic/react";

/**
 * Native iOS-style modal presentation: the card slides UP from the bottom (with a
 * backdrop fade) on present, and slides back down on dismiss — the "other" animation
 * vs the horizontal push/pop used for page navigation. Applied to full-screen
 * IonModals so, under `mode:"md"`, they still feel native instead of md scale/fade.
 * (Bottom-sheet IonModals that use `breakpoints` already slide up — leave those.)
 */
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
// 320ms (was 420 — outside the app's 150-350ms band), 0 under reduced motion:
// the global CSS kill-switch can't reach Ionic's Web-Animations engine, so
// this must check matchMedia itself (same pattern as pageTransition.ts).
const DURATION = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;

export function modalEnterAnimation(baseEl: HTMLElement): Animation {
  const root = (baseEl.shadowRoot || baseEl) as ParentNode;
  const backdropEl = root.querySelector("ion-backdrop");
  const wrapperEl = root.querySelector(".modal-wrapper");

  const backdrop = createAnimation()
    .addElement(backdropEl || baseEl)
    .fromTo("opacity", "0.01", "var(--backdrop-opacity, 0.4)");

  const wrapper = createAnimation()
    .addElement(wrapperEl || baseEl)
    .beforeStyles({ opacity: "1" })
    .fromTo("transform", "translateY(100%)", "translateY(0)");

  return createAnimation()
    .addElement(baseEl)
    .easing(EASING)
    .duration(DURATION())
    .addAnimation([backdrop, wrapper]);
}

export function modalLeaveAnimation(baseEl: HTMLElement): Animation {
  return modalEnterAnimation(baseEl).direction("reverse");
}
