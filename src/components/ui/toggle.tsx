"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { springTactile } from "@/lib/motion";

/** Small tactile on/off switch: recessed well, machined knob that slides on a critically damped spring. */
export function Toggle({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("well-recessed relative h-6 w-10 shrink-0 cursor-pointer rounded-full outline-none transition-colors", checked && "!bg-lime/30", className)}
    >
      <motion.span
        className="bevel-machined absolute left-0.5 top-0.5 size-5 rounded-full"
        animate={{ x: checked ? 16 : 0 }}
        whileTap={reduce ? undefined : { scale: 0.88 }}
        transition={springTactile}
      />
    </button>
  );
}
