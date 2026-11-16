"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Plane } from "lucide-react";
import { OFFICES, formatMoney, type OfficeId } from "@/domain";
import { Avatar } from "@/components/ui/avatar";
import { FilterChips } from "@/components/ui/filter-chips";
import { springGentle, springMechanical } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Snapshot, VolunteerView } from "@/sim/simulation";

function where(v: VolunteerView) {
  const p = v.presence;
  switch (p.kind) {
    case "office":
      return p.visiting ? `Visiting ${OFFICES[p.office].name}` : `In the ${OFFICES[p.office].name} office`;
    case "remote":
      return "Working from home";
    case "holiday":
      return "On holiday";
    default:
      return "Weekend";
  }
}

export function Roster({ snap }: { snap: Snapshot }) {
  const [office, setOffice] = useState<OfficeId>("OSL");
  const rows = snap.volunteers
    .filter((v) => v.volunteer.homeOffice === office || (v.presence.kind === "office" && v.presence.office === office))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.volunteer.name.localeCompare(b.volunteer.name));
  const eligible = rows.filter((r) => r.rank !== null).length;
  const cur = OFFICES[office].currency;
  return (
    <section className="bevel-machined flex h-full min-h-0 min-w-0 flex-col gap-3 rounded-[var(--radius-card)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <h3 className="text-[15px] font-semibold tracking-tight">Who’s next</h3>
          <p className="mt-1 text-[12px] text-ink-3">{eligible} of {rows.length} can be asked today</p>
        </div>
        <FilterChips
          size="sm"
          options={[{ id: "OSL", label: "Oslo" }, { id: "BLR", label: "Bengaluru" }]}
          value={office}
          onChange={(v) => setOffice(v as OfficeId)}
        />
      </div>
      <motion.ul
        key={office}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springGentle}
        className="-mx-1 max-h-[460px] min-h-0 space-y-1 overflow-y-auto px-1 pb-1 lg:max-h-none lg:flex-1"
        aria-label="Volunteer queue"
      >
          {rows.map((r) => {
            const isNext = r.rank === 1;
            const owedMinor = r.stats.outstandingClaims ? r.stats.owedReportingMinor : 0;
            return (
              <motion.li
                key={`${office}-${r.volunteer.id}`}
                layout="position"
                initial={false}
                animate={{ opacity: r.rank ? 1 : 0.55 }}
                transition={springMechanical}
                className={cn("flex items-center gap-2.5 rounded-2xl px-2 py-1.5", isNext ? "bevel-machined" : "hover:bg-raised")}
              >
                <span className={cn("w-5 text-center font-mono text-[12px] tabular-nums", r.rank ? "text-ink-2" : "text-ink-3")}>{r.rank ?? "–"}</span>
                <Avatar name={r.volunteer.name} office={r.volunteer.homeOffice} size={30} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-medium tracking-tight">
                    {r.volunteer.name}
                    {r.presence.kind === "office" && r.presence.visiting && <Plane className="size-3 text-ink-3" aria-label="visiting" />}
                    {isNext && <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springGentle} className="rounded-full bg-lime px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--peel-lime-foreground)]">Next</motion.span>}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{r.blocker ?? where(r)}</p>
                </div>
                <div className="text-right text-[11.5px] leading-tight text-ink-3">
                  <p className="tabular">{r.stats.recentRefills} in 60 d</p>
                  {owedMinor > 0 && <p className="mt-0.5 text-hot tabular">{formatMoney(owedMinor, "NOK")} owed</p>}
                </div>
              </motion.li>
            );
          })}
      </motion.ul>
      <p className="text-[11.5px] leading-relaxed text-ink-3">
        Order: in the office today first, then fewest refills in 60 days, then longest since their last one. People who are owed money by HR, on holiday or already busy are skipped ({cur === "NOK" ? "Oslo" : "Bengaluru"} shown).
      </p>
    </section>
  );
}
