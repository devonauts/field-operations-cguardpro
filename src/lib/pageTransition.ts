import { createAnimation } from "@ionic/react";
import type { Animation } from "@ionic/react";

/**
 * Native-style page transition for IonRouterOutlet, mode-agnostic.
 *
 * The app runs in `mode: "md"` for component styling, but Ionic's built-in
 * `iosTransitionAnimation` leans on iOS-only DOM parts (translucent nav bar, back-
 * button collapse) that don't exist under md — so the page SLIDE can silently no-op
 * and screens just snap in. This builds the slide directly on the `.ion-page`
 * elements so we get the real native push/pop feel regardless of mode:
 *   • PUSH  → entering page slides in opaque from the right; the leaving page
 *             parallax-shifts left and dims underneath.
 *   • POP   → the reverse (current page slides off to the right, previous returns).
 * createAnimation is progressable, so the edge swipe-back gesture drives it too.
 */
const DURATION = 360;
// UIKit-like ease for push/pop.
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const PARALLAX = "28%";

export function pageTransition(_baseEl: HTMLElement, opts: any): Animation {
  const back = opts?.direction === "back";
  const enteringEl: HTMLElement = opts.enteringEl;
  const leavingEl: HTMLElement | undefined = opts.leavingEl;

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const root = createAnimation()
    .duration(reduce ? 0 : opts?.duration ?? DURATION)
    .easing(EASING);

  // Entering page must be revealed (Ionic hides pending pages with this class).
  const entering = createAnimation()
    .addElement(enteringEl)
    .beforeRemoveClass("ion-page-invisible");
  root.addAnimation(entering);

  const leaving = leavingEl ? createAnimation().addElement(leavingEl) : null;
  if (leaving) root.addAnimation(leaving);

  if (!back) {
    // PUSH
    entering
      .beforeStyles({ "z-index": "101" })
      .fromTo("transform", "translateX(100%)", "translateX(0)")
      .fromTo("opacity", "1", "1");
    if (leaving) {
      leaving
        .beforeStyles({ "z-index": "100" })
        .fromTo("transform", "translateX(0)", `translateX(-${PARALLAX})`)
        .fromTo("opacity", "1", "0.55");
    }
  } else {
    // POP
    entering
      .beforeStyles({ "z-index": "100" })
      .fromTo("transform", `translateX(-${PARALLAX})`, "translateX(0)")
      .fromTo("opacity", "0.55", "1");
    if (leaving) {
      leaving
        .beforeStyles({ "z-index": "101" })
        .fromTo("transform", "translateX(0)", "translateX(100%)")
        .fromTo("opacity", "1", "1");
    }
  }

  return root;
}
