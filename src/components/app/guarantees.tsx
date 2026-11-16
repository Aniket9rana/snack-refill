"use client";

import { motion } from "motion/react";
import { CircleDollarSign, Repeat2, ShieldCheck, UsersRound } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { springGentle } from "@/lib/motion";
import type { Snapshot } from "@/sim/simulation";

const int = (n: number) => String(Math.round(n));

/** The four problems from the brief, each with a live counter that proves the rule is doing its job. */
export function Guarantees({ snap }: { snap: Snapshot }) {
  const hist = snap.refills.flatMap((r) => r.history);
  const passedOn = hist.filter((h) => ["declined", "offer_expired", "commit_expired"].includes(h.type)).length;
  const retried = hist.filter((h) => h.type === "claim_retry").length;
  const open = snap.refills.filter((r) => ["OFFERED", "ESCALATED", "COMMITTED", "BUDGET_HOLD"].includes(r.state)).length;
  const buyers = new Set(snap.refills.filter((r) => r.purchase).map((r) => r.purchase!.by)).size;
  const paid = snap.refills.filter((r) => r.reimbursement);
  const days = paid.length ? paid.reduce((a, r) => a + (r.reimbursement!.at - r.purchase!.at) / 86_400_000, 0) / paid.length : 0;
  const cards = [
    { icon: ShieldCheck, title: "One shopper per box", value: snap.conflictsBlocked, fmt: int, unit: "double bookings blocked", body: "At most one open refill per office, and taking it is a compare-and-set: one winner, everyone else is told." },
    { icon: Repeat2, title: "Nobody leaves it hanging", value: passedOn, fmt: int, unit: "times it was passed on", body: "2 h to answer an offer, 24 h to deliver. Then it moves on by itself, and after 3 asks it goes to everyone." },
    { icon: UsersRound, title: "Spread the load", value: buyers, fmt: int, unit: "different people have bought", body: "Fewest recent refills first. Anyone still waiting on HR for money is skipped." },
    { icon: CircleDollarSign, title: "Paid back fast", value: days, fmt: (n: number) => n.toFixed(1), unit: `days receipt → paid · ${retried} HR retries`, body: "The claim goes to HR the second the receipt lands; if HR is down it is retried until it sticks." },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c, i) => (
        <motion.div key={c.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ ...springGentle, delay: i * 0.05 }} whileHover={{ y: -2 }} className="bevel-machined flex flex-col gap-3 rounded-[var(--radius-card)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="well-recessed flex size-9 items-center justify-center rounded-xl text-ink-2"><c.icon className="size-4" /></span>
            <h3 className="text-[14px] font-semibold tracking-tight">{c.title}</h3>
          </div>
          <p className="text-3xl font-semibold leading-none tracking-tight"><AnimatedNumber value={c.value} format={c.fmt} /></p>
          <p className="-mt-1.5 text-[12px] text-ink-3">{c.unit}{c.title.startsWith("One") ? ` · ${open} open now` : ""}</p>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{c.body}</p>
        </motion.div>
      ))}
    </div>
  );
}
