"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlarmClock, BadgeCheck, Hash, MessageSquareText, ShieldAlert, Wallet } from "lucide-react";
import { OFFICES } from "@/domain";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { fmtDate, fmtTime } from "@/lib/format";
import { springGentle } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Simulation, SimMessage, Snapshot } from "@/sim/simulation";

const KIND_ICON: Record<string, typeof Hash> = {
  offer: MessageSquareText,
  offer_reassigned: MessageSquareText,
  reminder: AlarmClock,
  committed: BadgeCheck,
  commit_released: AlarmClock,
  escalation: ShieldAlert,
  budget_hold: Wallet,
  budget_warning: Wallet,
  purchase_logged: BadgeCheck,
  claim_status: BadgeCheck,
  claim_nudge: AlarmClock,
  reimbursed: BadgeCheck,
};
const KIND_TONE: Record<string, string> = {
  offer: "text-sky",
  committed: "text-lime-ink",
  reimbursed: "text-lime-ink",
  escalation: "text-coral",
  budget_hold: "text-coral",
  budget_warning: "text-hot",
  reminder: "text-hot",
  commit_released: "text-hot",
};

function target(m: SimMessage, sim: Simulation) {
  if ("user" in m.target) return { label: sim.nameOf(m.target.user), kind: "dm" as const };
  if ("channel" in m.target) return { label: `#snacks-${OFFICES[m.target.channel].name.toLowerCase()}`, kind: "channel" as const };
  return { label: `${OFFICES[m.target.leads].name} leads`, kind: "lead" as const };
}

export function ChatPanel({ snap, sim, onReceipt }: { snap: Snapshot; sim: Simulation; onReceipt: (id: string) => void }) {
  const [tab, setTab] = useState("all");
  // Ids we have already seen: only a genuinely new message animates in. Switching tabs must never replay it.
  const [known, setKnown] = useState<Set<number> | null>(null);
  const fresh = (id: number) => known !== null && !known.has(id);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKnown(new Set(snap.messages.map((m) => m.id)));
  }, [snap.messages]);
  const msgs = snap.messages.filter((m) => (tab === "all" ? true : tab === "dm" ? "user" in m.target : !("user" in m.target))).slice(0, 14);
  return (
    <section className="bevel-machined flex h-full min-h-0 min-w-0 flex-col gap-3 rounded-[var(--radius-card)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <h3 className="text-[15px] font-semibold tracking-tight">Chat tool (simulated)</h3>
          <p className="mt-1 text-[12px] text-ink-3">Everything the bot would send, with working buttons</p>
        </div>
        <FilterChips size="sm" options={[{ id: "all", label: "All" }, { id: "dm", label: "DMs" }, { id: "ch", label: "Channels" }]} value={tab} onChange={(v) => setTab(v as string)} />
      </div>
      <motion.ul
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springGentle}
        className="-mx-1 flex max-h-[460px] min-h-0 flex-col gap-2 overflow-y-auto px-1 pb-1 lg:max-h-none lg:flex-1"
      >
          {msgs.map((m) => {
            const t = target(m, sim);
            const refill = snap.refills.find((r) => r.id === m.refillId);
            const Icon = KIND_ICON[m.kind] ?? Hash;
            const user = "user" in m.target ? m.target.user : undefined;
            const canAnswer = m.actions?.includes("accept") && refill?.state === "OFFERED" && refill.offeredTo === user;
            const canTake = m.actions?.includes("take") && refill?.state === "ESCALATED";
            const canReceipt = m.actions?.includes("complete") && refill?.state === "COMMITTED" && refill.commit?.by === user;
            const taker = canTake ? snap.candidates[m.office][0]?.volunteer : undefined;
            return (
              <motion.li
                key={m.id}
                initial={fresh(m.id) ? { opacity: 0, y: -14, scale: 0.98 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={springGentle}
                className="field-fill rounded-2xl p-3"
              >
                <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
                  <Icon className={cn("size-3.5", KIND_TONE[m.kind] ?? "text-ink-2")} />
                  <span className="font-medium text-ink-2">{t.kind === "dm" ? `DM to ${t.label}` : t.label}</span>
                  <span className="ml-auto tabular-nums">{fmtDate(m.at)} {fmtTime(m.at)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{m.text}</p>
                {(canAnswer || canTake || canReceipt) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {canAnswer && (
                      <>
                        <Button size="sm" onClick={() => sim.accept(m.refillId, user!)}>I’ll do it</Button>
                        <Button size="sm" variant="secondary" onClick={() => sim.decline(m.refillId, user!)}>Can’t today</Button>
                      </>
                    )}
                    {canTake && taker && <Button size="sm" onClick={() => sim.accept(m.refillId, taker.id)}>I’ll take it · as {taker.name}</Button>}
                    {canReceipt && <Button size="sm" onClick={() => onReceipt(m.refillId)}>Add receipt</Button>}
                  </div>
                )}
              </motion.li>
            );
          })}
        {msgs.length === 0 && <li className="rounded-2xl border border-dashed border-line px-3 py-8 text-center text-[12px] text-ink-3">No messages yet. Press Play or report a box as empty.</li>}
      </motion.ul>
    </section>
  );
}
