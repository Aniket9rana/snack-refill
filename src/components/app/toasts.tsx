"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { springGentle } from "@/lib/motion";
import type { Snapshot } from "@/sim/simulation";

const ICON = { ok: CheckCircle2, warn: AlertTriangle, info: Info };
const TONE = { ok: "text-success", warn: "text-coral", info: "text-sky" };

export function Toasts({ toasts }: { toasts: Snapshot["toasts"] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={springGentle}
              className="bevel-machined pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm text-ink"
            >
              <Icon className={`size-4 shrink-0 ${TONE[t.tone]}`} />
              <span className="min-w-0">{t.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
