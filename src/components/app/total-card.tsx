"use client";

import { motion } from "motion/react";
import { Globe2 } from "lucide-react";
import { formatMoney } from "@/domain";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { fmtMonth } from "@/lib/format";
import { springGentle, springMechanical } from "@/lib/motion";
import type { Snapshot } from "@/sim/simulation";

export function TotalCard({ snap }: { snap: Snapshot }) {
  const rep = snap.reports[snap.month];
  if (!rep) return <div className="skeleton min-h-[320px] rounded-[var(--radius-card)]" />;
  const total = rep.total;
  const [osl, blr] = rep.offices;
  const share = total.spentMinor ? (osl.spentReportingMinor / total.spentMinor) * 100 : 50;
  const fmt = (n: number) => formatMoney(Math.round(n / 100) * 100, rep.reporting);
  return (
    <motion.section layout className="bevel-machined flex min-w-0 flex-col justify-between gap-5 rounded-[var(--radius-card)] p-5 md:col-span-2 xl:col-span-1" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springGentle, delay: 0.06 }}>
      <div className="flex items-center gap-3">
        <span className="well-recessed flex size-11 items-center justify-center rounded-[14px] text-ink-2"><Globe2 className="size-5" /></span>
        <div className="leading-tight">
          <h2 className="text-lg font-semibold tracking-tight">Both offices</h2>
          <p className="micro-label mt-1.5">Management view · {fmtMonth(snap.month)}</p>
        </div>
      </div>
      <div>
        <p className="micro-label">Total spent, in {rep.reporting}</p>
        <p className="mt-2 text-[40px] font-semibold leading-none tracking-tight">
          <AnimatedNumber value={total.spentMinor} format={fmt} />
        </p>
        <p className="mt-2 text-[13px] text-ink-2">
          of {formatMoney(total.budgetMinor, rep.reporting)} combined budget · {total.refills} refills
        </p>
      </div>
      <div>
        <div className="well-recessed flex h-3.5 overflow-hidden rounded-full p-[3px]">
          <div className="flex h-full w-full overflow-hidden rounded-full">
            <motion.div className="h-full bg-sky" initial={false} animate={{ width: `${share}%` }} transition={springMechanical} />
            <motion.div className="h-full flex-1 bg-hot" />
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-ink-2">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky" />Oslo {formatMoney(osl.spentMinor, "NOK")}</span>
          <span className="inline-flex items-center gap-1.5">Bengaluru {formatMoney(blr.spentMinor, "INR")}<span className="size-2 rounded-full bg-hot" /></span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Each office is added up in its own currency; only this line converts, at {rep.rates.perUnit.INR} NOK per ₹ (fixed for {rep.rates.asOf}).
        </p>
      </div>
    </motion.section>
  );
}
