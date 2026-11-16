"use client";

import { AnimatePresence, motion } from "motion/react";
import { PackageOpen } from "lucide-react";
import { OFFICES, formatMoney, type OfficeId } from "@/domain";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { MagneticSplitButton } from "@/components/ui/magnetic-split-button";
import { fmtMonth, fmtSpan } from "@/lib/format";
import { springGentle, springMechanical } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Simulation, Snapshot } from "@/sim/simulation";

const CELLS = 14;
const REPORT_ACTIONS = ["Chips & biscuits ran out", "Fruit & nuts ran out", "Everything is gone"];
const ITEMS: Record<string, string[]> = {
  "Chips & biscuits ran out": ["Chips", "Biscuits"],
  "Fruit & nuts ran out": ["Fruit & dried fruit", "Nuts & trail mix"],
  "Everything is gone": ["Chips", "Granola bars", "Fruit & dried fruit"],
};

function statusOf(snap: Snapshot, office: OfficeId, who: (id: string) => string) {
  const r = snap.refills.find((x) => x.office === office && ["OFFERED", "ESCALATED", "COMMITTED", "BUDGET_HOLD"].includes(x.state));
  if (!r) return { text: "Box is stocked, nothing to do", tone: "ok" as const };
  switch (r.state) {
    case "OFFERED":
      return { text: `Asking ${who(r.offeredTo!)} · ${fmtSpan((r.offerExpiresAt ?? snap.now) - snap.now)} to answer`, tone: "live" as const };
    case "ESCALATED":
      return { text: "Open to everyone in the office, first to tap wins", tone: "warn" as const };
    case "COMMITTED":
      return { text: `${who(r.commit!.by)} is buying · ${fmtSpan(r.commit!.deadline - snap.now)} left`, tone: "live" as const };
    default:
      return { text: "Budget used up, waiting for next month", tone: "warn" as const };
  }
}

export function OfficeCard({ office, snap, sim }: { office: OfficeId; snap: Snapshot; sim: Simulation }) {
  const cfg = OFFICES[office];
  const b = snap.budgets[office];
  const level = snap.box[office];
  const filled = Math.round((level / 100) * CELLS);
  const tone = level > 40 ? "bg-lime" : level > 15 ? "bg-hot" : "bg-coral";
  const label = level > 40 ? "Plenty left" : level > 15 ? "Running low" : level > 3 ? "Almost empty" : "Empty";
  const st = statusOf(snap, office, sim.nameOf);
  const spentPct = Math.min(100, (b.spentMinor / b.budgetMinor) * 100);
  const resPct = Math.min(100 - spentPct, (b.reservedMinor / b.budgetMinor) * 100);
  const fmt = (n: number) => formatMoney(Math.round(n / 100) * 100, cfg.currency);
  const accent = office === "OSL" ? "text-sky" : "text-hot";

  return (
    <motion.section
      layout
      className="bevel-machined flex min-w-0 flex-col gap-5 rounded-[var(--radius-card)] p-5"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("well-recessed flex size-11 items-center justify-center rounded-[14px] font-mono text-[13px] font-semibold", accent)}>{office}</span>
          <div className="leading-tight">
            <h2 className="text-lg font-semibold tracking-tight">{cfg.name}</h2>
            <p className="micro-label mt-1.5">{cfg.currency} · {fmtMonth(snap.month)}</p>
          </div>
        </div>
        <MagneticSplitButton
          size="sm"
          defaultAction="Report empty"
          icon={<PackageOpen className="size-3.5" />}
          actions={REPORT_ACTIONS.map((a) => ({ id: a, label: a }))}
          onAction={(a) => sim.report(office, ITEMS[a] ?? [])}
        />
      </div>

      {/* The snack box */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="micro-label">Snack box</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="text-[13px] font-medium text-ink-2">
              {label}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="well-recessed flex h-12 items-end gap-1 rounded-2xl p-1.5" role="meter" aria-label={`${cfg.name} snack box level`} aria-valuenow={Math.round(level)} aria-valuemin={0} aria-valuemax={100}>
          {Array.from({ length: CELLS }, (_, i) => (
            <motion.span
              key={i}
              className={cn("w-full origin-bottom rounded-[6px]", i < filled ? tone : "bg-active")}
              animate={{ scaleY: i < filled ? 1 : 0.38, opacity: i < filled ? 1 : 0.7 }}
              transition={{ ...springMechanical, delay: Math.abs(i - filled) * 0.008 }}
              style={{ height: "100%" }}
            />
          ))}
        </div>
        <p className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-2">
          <span className={cn("relative size-2 rounded-full", st.tone === "ok" ? "bg-lime" : st.tone === "live" ? "pulse-dot bg-sky text-sky" : "pulse-dot bg-coral text-coral")} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={st.text.replace(/\d+[dhm]( \d+[hm])?/g, "")} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}>
              {st.text}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>

      {/* Budget */}
      <div>
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <p className="micro-label">Spent this month</p>
            <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight">
              <AnimatedNumber value={b.spentMinor} format={fmt} />
            </p>
          </div>
          <p className="pb-0.5 text-right text-[13px] text-ink-2">
            of {formatMoney(b.budgetMinor, cfg.currency)}
            <br />
            <span className={cn(b.availableMinor < cfg.typicalMinMinor && "text-coral")}>{formatMoney(b.availableMinor, cfg.currency)} left</span>
          </p>
        </div>
        <div className="well-recessed relative flex h-3.5 overflow-hidden rounded-full p-[3px]" role="progressbar" aria-valuenow={Math.round(b.utilisation * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
          <div className="relative flex h-full w-full overflow-hidden rounded-full">
            <motion.div className={cn("h-full rounded-full", b.utilisation > 0.9 ? "bg-coral" : "bg-ink")} initial={false} animate={{ width: `${spentPct}%` }} transition={springMechanical} />
            <motion.div className="hatch h-full text-ink-3" initial={false} animate={{ width: `${resPct}%` }} transition={springMechanical} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink" />Spent</span>
          <span className="inline-flex items-center gap-1.5"><span className="hatch size-2 rounded-full text-ink-2" />Promised to a buyer {b.reservedMinor ? `· ${formatMoney(b.reservedMinor, cfg.currency)}` : ""}</span>
        </div>
      </div>
    </motion.section>
  );
}
