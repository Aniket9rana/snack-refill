import type { Transition } from "motion/react";

/*
 * Critically damped springs from Peel UI (DESIGN.md §4).
 * ζ = c / (2·√(k·m)) must stay within 0.85–1.00: no rubbery overshoot.
 */

/** ζ ≈ 0.98: zero-overshoot snap for buttons, pills and toggles. */
export const springTactile: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 36,
  mass: 0.65,
};

/** ζ ≈ 0.92: crisp structural moves (menus, drawers, layout). */
export const springMechanical: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.85,
};

/** ζ ≈ 0.88: smooth follow-through for cards, reveals and page entrances. */
export const springGentle: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 26,
  mass: 0.9,
};

/** Cursor-parallax spring config (used with useSpring). */
export const springAmbient = { stiffness: 65, damping: 24, mass: 1.1 };

/** Pointer-tilt spring config for covers (used with useSpring). */
export const springTilt = { stiffness: 300, damping: 30, mass: 0.7 };

/** Staggered reveal helpers. */
export const revealContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

export const revealItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: springGentle },
};
