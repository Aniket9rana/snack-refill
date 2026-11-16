"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { RefillCard } from "./refill-card";
import { springGentle } from "@/lib/motion";
import type { Refill, RefillState } from "@/domain";
import type { Simulation, Snapshot } from "@/sim/simulation";

const COLUMNS: { id: string; title: string; hint: string; states: RefillState[] }[] = [
  { id: "ask", title: "Finding a buyer", hint: "One person asked at a time", states: ["OFFERED", "ESCALATED", "BUDGET_HOLD"] },
  { id: "commit", title: "Shopping", hint: "24 h to buy and upload the receipt", states: ["COMMITTED"] },
  { id: "hr", title: "With HR", hint: "Claim sent the moment the receipt lands", states: ["PURCHASED", "CLAIMED", "CLAIM_REJECTED"] },
  { id: "paid", title: "Paid back", hint: "Reimbursed in payroll currency", states: ["REIMBURSED"] },
];

export function Board({ snap, sim, onReceipt }: { snap: Snapshot; sim: Simulation; onReceipt: (id: string) => void }) {
  const byCol = (states: RefillState[], limit?: number): Refill[] => snap.refills.filter((r) => states.includes(r.state)).slice(0, limit);
  return (
    <LayoutGroup>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((c, ci) => {
          const items = byCol(c.states, c.id === "paid" ? 5 : undefined);
          const total = snap.refills.filter((r) => c.states.includes(r.state)).length;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springGentle, delay: 0.05 * ci }} className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-[13px] font-semibold tracking-tight">{c.title}</h3>
                <span className="micro-label tabular">{total}</span>
              </div>
              <p className="-mt-1.5 px-1 text-[12px] text-ink-3">{c.hint}</p>
              <div className="well-recessed flex min-h-[132px] flex-1 flex-col gap-2.5 rounded-[var(--radius-card)] p-2">
                <AnimatePresence mode="popLayout" initial={false}>
                  {items.map((r) => (
                    <RefillCard key={r.id} r={r} snap={snap} sim={sim} onReceipt={onReceipt} />
                  ))}
                </AnimatePresence>
                {items.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-[var(--radius-dock)] border border-dashed border-line px-3 py-8 text-center text-[12px] text-ink-3">
                    Nothing here right now
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
