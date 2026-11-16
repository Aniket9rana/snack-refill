"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FileBarChart } from "lucide-react";
import { OFFICES, formatMoney, type MonthlyReport } from "@/domain";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Avatar } from "@/components/ui/avatar";
import { FilterChips } from "@/components/ui/filter-chips";
import { fmtMonth } from "@/lib/format";
import { springGentle, springMechanical } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Snapshot } from "@/sim/simulation";

const hrs = (n: number | null) => (n === null ? "–" : n < 24 ? `${n.toFixed(1)} h` : `${(n / 24).toFixed(1)} d`);

export function ReportPanel({ snap }: { snap: Snapshot }) {
  const months = Object.keys(snap.reports).sort().reverse();
  const [pick, setPick] = useState<string | null>(null);
  const month = pick && snap.reports[pick] ? pick : snap.month;
  const rep: MonthlyReport | undefined = snap.reports[month];
  if (!rep) return <div className="skeleton h-64 rounded-[var(--radius-card)]" />;
  const maxItem = Math.max(1, ...rep.items.slice(0, 7).map((i) => i.bought + i.ranOut));
  const maxC = Math.max(1, ...rep.contributors.slice(0, 7).map((c) => c.refills));
  const fmtR = (n: number) => formatMoney(Math.round(n / 100) * 100, rep.reporting);
  return (
    <section className="bevel-machined flex min-w-0 flex-col gap-6 rounded-[var(--radius-card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="well-recessed flex size-11 items-center justify-center rounded-[14px] text-ink-2"><FileBarChart className="size-5" /></span>
          <div className="leading-tight">
            <h2 className="text-lg font-semibold tracking-tight">Monthly report for management</h2>
            <p className="mt-1.5 text-[12px] text-ink-3">One page, both offices, one currency at the bottom line</p>
          </div>
        </div>
        <FilterChips size="sm" options={months.map((m) => ({ id: m, label: fmtMonth(m) }))} value={month} onChange={(v) => setPick(v as string)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-5">
          <div className="well-recessed rounded-[var(--radius-dock)] p-4">
            <p className="micro-label">Total spend · {fmtMonth(month)}</p>
            <p className="mt-2.5 text-4xl font-semibold leading-none tracking-tight"><AnimatedNumber value={rep.total.spentMinor} format={fmtR} /></p>
            <p className="mt-2 text-[12.5px] text-ink-2">{Math.round(rep.total.utilisation * 100)}% of {fmtR(rep.total.budgetMinor)} · {rep.total.refills} refills · 1 ₹ = {rep.rates.perUnit.INR} {rep.reporting}</p>
          </div>
          {rep.offices.map((o) => (
            <div key={o.office}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[14px] font-medium">{o.name}</p>
                <p className="text-[13px] text-ink-2 tabular-nums">{formatMoney(o.spentMinor, o.currency)} <span className="text-ink-3">of {formatMoney(o.budgetMinor, o.currency)}</span></p>
              </div>
              <div className="well-recessed mt-2 h-3 overflow-hidden rounded-full p-[3px]">
                <div className="h-full w-full overflow-hidden rounded-full">
                  <motion.div className={cn("h-full rounded-full", o.utilisation > 0.9 ? "bg-coral" : o.office === "OSL" ? "bg-sky" : "bg-hot")} initial={false} animate={{ width: `${Math.min(100, o.utilisation * 100)}%` }} transition={springMechanical} />
                </div>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
                {[
                  ["Refills", String(o.refills)],
                  ["Avg purchase", o.refills ? formatMoney(o.avgPurchaseMinor, o.currency) : "–"],
                  ["Empty → stocked", hrs(o.avgHoursToRefill)],
                  ["HR pays in", o.avgDaysToReimburse === null ? "–" : `${o.avgDaysToReimburse.toFixed(1)} d`],
                ].map(([k, v]) => (
                  <div key={k}><dt className="text-ink-3">{k}</dt><dd className="mt-0.5 font-medium tabular-nums">{v}</dd></div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <p className="micro-label mb-3">What actually gets eaten</p>
            <ul className="space-y-2.5">
              {rep.items.slice(0, 7).map((i, idx) => (
                <li key={i.item}>
                  <div className="flex justify-between text-[12.5px]"><span>{i.item}</span><span className="text-ink-3 tabular-nums">{i.bought} bought · {i.ranOut} ran out</span></div>
                  <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded-full">
                    <motion.div className="h-full bg-ink" initial={{ width: 0 }} animate={{ width: `${(i.bought / maxItem) * 100}%` }} transition={{ ...springGentle, delay: idx * 0.03 }} />
                    <motion.div className="hatch h-full text-coral" initial={{ width: 0 }} animate={{ width: `${(i.ranOut / maxItem) * 100}%` }} transition={{ ...springGentle, delay: idx * 0.03 }} />
                  </div>
                </li>
              ))}
              {rep.items.length === 0 && <li className="text-[12.5px] text-ink-3">No data for this month yet.</li>}
            </ul>
          </div>
          <div>
            <p className="micro-label mb-3">Who carried the load</p>
            <ul className="space-y-2">
              {rep.contributors.slice(0, 6).map((c, idx) => (
                <li key={c.id} className="flex items-center gap-2.5">
                  <Avatar name={c.name} office={c.office} size={26} />
                  <span className="w-20 truncate text-[12.5px]">{c.name}</span>
                  <div className="flex-1"><motion.div className="h-2 rounded-full bg-ink-2" initial={{ width: 0 }} animate={{ width: `${(c.refills / maxC) * 100}%` }} transition={{ ...springGentle, delay: idx * 0.03 }} /></div>
                  <span className="w-24 text-right text-[12px] text-ink-3 tabular-nums">{c.refills}× · {formatMoney(c.spentMinor, c.currency)}</span>
                </li>
              ))}
              {rep.contributors.length === 0 && <li className="text-[12.5px] text-ink-3">No purchases yet.</li>}
            </ul>
            <p className="mt-3 text-[12px] text-ink-3">
              {OFFICES.OSL.name}: top volunteer did {Math.round(rep.offices[0].topContributorShare * 100)}% of refills · {OFFICES.BLR.name}: {Math.round(rep.offices[1].topContributorShare * 100)}%
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
