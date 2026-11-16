"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Time-left ring. `fraction` 1 = full time left, 0 = out of time. Turns coral in the last 20%. */
export function CountdownRing({ fraction, size = 22, className }: { fraction: number; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const f = Math.min(1, Math.max(0, fraction));
  const r = (size - 4) / 2;
  const urgent = f < 0.2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0 -rotate-90", urgent ? "text-coral" : "text-ink-2", className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={2.5} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: f }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 24 }}
      />
    </svg>
  );
}
