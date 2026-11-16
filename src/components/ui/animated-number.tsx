"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";

/** Counts to its value with a critically damped spring. Writes to the DOM directly: no re-render per frame. */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { type: "spring", stiffness: 140, damping: 22, mass: 0.9 });
    return () => c.stop();
  }, [value, mv, reduce]);
  useEffect(() => {
    const el = ref.current;
    if (el) el.textContent = format(mv.get());
    return mv.on("change", (v) => {
      if (ref.current) ref.current.textContent = format(v);
    });
  }, [mv, format]);
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(value)}
    </span>
  );
}
