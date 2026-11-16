"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Flag, Receipt, Swords, Users } from "lucide-react";
import { OFFICES, formatMoney, type Refill, type RefillState } from "@/domain";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CountdownRing } from "@/components/ui/countdown-ring";
import { fmtDate, fmtSpan, fmtTime } from "@/lib/format";
import { springGentle, springMechanical } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Simulation, Snapshot } from "@/sim/simulation";

const LABEL: Record<RefillState, { text: string; cls: string }> = {
  OFFERED: { text: "Asked", cls: "text-sky" },
  ESCALATED: { text: "Open to all", cls: "text-coral" },
  COMMITTED: { text: "Committed", cls: "text-hot" },
  BUDGET_HOLD: { text: "On hold", cls: "text-coral" },
  PURCHASED: { text: "Claim queued", cls: "text-hot" },
  CLAIMED: { text: "With HR", cls: "text-sky" },
  REIMBURSED: { text: "Paid back", cls: "text-success" },
  CLAIM_REJECTED: { text: "Rejected", cls: "text-danger" },
  CANCELLED: { text: "Cancelled", cls: "text-ink-3" },
};

const HIST: Record<string, string> = {
  reported: "Box reported empty",
  offered: "Offered",
  declined: "Declined",
  offer_expired: "No answer, passed on",
  escalated: "Opened to everyone",
  committed: "Committed",
  reminded: "Reminder sent",
  commit_expired: "Deadline missed, reassigned",
  budget_hold: "Budget hold",
  budget_resume: "Budget back, resumed",
  purchased: "Receipt uploaded",
  claim_sent: "Claim sent to HR",
  claim_retry: "HR unreachable, will retry",
  claim_reminder: "Lead nudged about slow claim",
  reimbursed: "Reimbursed",
  claim_rejected: "HR rejected the claim",
};

export function RefillCard({ r, snap, sim, onReceipt }: { r: Refill; snap: Snapshot; sim: Simulation; onReceipt: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = OFFICES[r.office];
  const st = LABEL[r.state];
  const name = sim.nameOf;
  const actor = r.state === "OFFERED" ? r.offeredTo : r.commit?.by ?? r.purchase?.by;
  let ring: number | null = null;
  let timeLeft = "";
  if (r.state === "OFFERED" && r.offerExpiresAt) {
    ring = (r.offerExpiresAt - snap.now) / 7_200_000;
    timeLeft = fmtSpan(r.offerExpiresAt - snap.now);
  } else if (r.state === "COMMITTED" && r.commit) {
    ring = (r.commit.deadline - snap.now) / 86_400_000;
    timeLeft = fmtSpan(r.commit.deadline - snap.now);
  }
  const claim = r.claim?.id ? sim.hrClaim(r.claim.id) : undefined;

  return (
    <motion.article
      layout="position"
      layoutId={r.id}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={springGentle}
      whileHover={{ y: -2 }}
      className="bevel-machined flex flex-col gap-3 rounded-[var(--radius-dock)] p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-medium text-ink-2">
          <span className={cn("size-2 rounded-full", r.office === "OSL" ? "bg-sky" : "bg-hot")} />
          {cfg.name}
          <span className="font-mono text-ink-3">{r.id}</span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={r.state} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.14 }} className={cn("micro-label !font-semibold", st.cls)}>
            {st.text}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="flex min-h-9 items-center gap-2.5">
        {actor ? <Avatar name={name(actor)} office={(snap.volunteers.find((v) => v.volunteer.id === actor)?.volunteer.homeOffice) ?? r.office} size={34} /> : <span className="well-recessed flex size-[34px] items-center justify-center rounded-full text-ink-3"><Users className="size-4" /></span>}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-medium tracking-tight">
            {r.state === "OFFERED" && `Asking ${name(r.offeredTo!)}`}
            {r.state === "ESCALATED" && "Anyone eligible can take it"}
            {r.state === "COMMITTED" && `${name(r.commit!.by)} is on it`}
            {r.state === "BUDGET_HOLD" && "Waiting for budget"}
            {(r.state === "PURCHASED" || r.state === "CLAIMED") && `${name(r.purchase!.by)} fronted the money`}
            {r.state === "REIMBURSED" && `${name(r.purchase!.by)} was paid back`}
            {r.state === "CLAIM_REJECTED" && "HR rejected the claim"}
          </p>
          <p className="mt-1 truncate text-[12px] text-ink-3">
            {r.state === "OFFERED" && `${timeLeft} to answer · offer ${r.directOffers} of 3`}
            {r.state === "ESCALATED" && "Direct offers used up"}
            {r.state === "COMMITTED" && `Spend up to ${formatMoney(r.commit!.capMinor, cfg.currency)} · ${timeLeft} left`}
            {r.state === "BUDGET_HOLD" && "Resumes automatically next month"}
            {r.state === "PURCHASED" && `${formatMoney(r.purchase!.amountMinor, cfg.currency)} · HR unreachable, retrying`}
            {r.state === "CLAIMED" && `${formatMoney(r.purchase!.amountMinor, cfg.currency)} · ${r.claim?.id} · ${fmtSpan(snap.now - (r.claim?.submittedAt ?? snap.now))} with HR${claim ? "" : ""}`}
            {r.state === "REIMBURSED" && `${formatMoney(r.reimbursement!.amountMinor, r.reimbursement!.currency)} in ${r.reimbursement!.currency} payroll`}
            {r.state === "CLAIM_REJECTED" && "Spend removed from the budget"}
          </p>
        </div>
        {ring !== null && <CountdownRing fraction={ring} />}
      </div>

      {r.itemsLow.length > 0 && (r.state === "OFFERED" || r.state === "ESCALATED" || r.state === "COMMITTED") && (
        <div className="flex flex-wrap gap-1">
          {r.itemsLow.map((i) => (
            <span key={i} className="field-fill rounded-full px-2 py-0.5 text-[11px] text-ink-2">{i}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {r.state === "OFFERED" && (
          <>
            <Button size="sm" variant="primary" onClick={() => sim.accept(r.id, r.offeredTo!)}>Accept as {name(r.offeredTo!)}</Button>
            <Button size="sm" variant="secondary" onClick={() => sim.decline(r.id, r.offeredTo!)}>Can’t today</Button>
            <Button size="sm" variant="ghost" onClick={() => sim.openToEveryone(r.id)} aria-label="Open to everyone"><Flag className="size-3.5" />Open to all</Button>
          </>
        )}
        {r.state === "ESCALATED" && (
          <Button size="sm" variant="secondary" onClick={() => sim.race(r.id, 5)}><Swords className="size-3.5" />Race test · 5 at once</Button>
        )}
        {r.state === "COMMITTED" && (
          <Button size="sm" variant="primary" onClick={() => onReceipt(r.id)}><Receipt className="size-3.5" />Add receipt</Button>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2 text-[12px] text-ink-3 outline-none transition-colors hover:text-ink">
          History
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={springMechanical}><ChevronDown className="size-3.5" /></motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={springMechanical} className="-mx-1 overflow-hidden">
            <div className="space-y-2 px-1 pb-1 pt-1">
              {r.history.map((h, i) => (
                <li key={i} className="relative pl-4 text-[12px] leading-snug">
                  <span className="absolute left-0 top-[5px] size-1.5 rounded-full bg-ink-3" />
                  <span className="font-medium text-ink">{HIST[h.type] ?? h.type}{h.by ? ` · ${name(h.by)}` : ""}</span>
                  <span className="ml-1.5 text-ink-3">{fmtDate(h.at)} {fmtTime(h.at)}</span>
                  {h.note && <p className="mt-0.5 text-ink-3">{h.note}</p>}
                </li>
              ))}
            </div>
          </motion.ol>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
