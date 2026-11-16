"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, X } from "lucide-react";
import { OFFICES, SNACK_CATALOG, formatMoney, type Refill } from "@/domain";
import { Button } from "@/components/ui/button";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { springGentle, springTactile } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Simulation } from "@/sim/simulation";

/** Receipt form. Shows the buyer's cap live, and what happens if they go over it. */
export function PurchaseSheet({ refill, sim, onClose }: { refill: Refill | null; sim: Simulation; onClose: () => void }) {
  return (
    <AnimatePresence>
      {refill && <Sheet key={refill.id} refill={refill} sim={sim} onClose={onClose} />}
    </AnimatePresence>
  );
}

function Sheet({ refill, sim, onClose }: { refill: Refill; sim: Simulation; onClose: () => void }) {
  const cfg = OFFICES[refill.office];
  const cap = refill.commit!.capMinor;
  const by = refill.commit!.by;
  const [amount, setAmount] = useState(String(Math.round((cfg.typicalMinMinor + cfg.typicalMaxMinor) / 2 / 100)));
  const [items, setItems] = useState<string[]>(refill.itemsLow);
  const [photo, setPhoto] = useState(false);
  const [lead, setLead] = useState(false);
  const minor = Math.round(parseFloat(amount || "0") * 100);
  const valid = Number.isFinite(minor) && minor > 0;
  const over = valid && minor > cap;
  const ready = valid && photo && (!over || lead);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Upload receipt">
      <motion.button type="button" aria-label="Close" className="absolute inset-0 bg-[color-mix(in_srgb,var(--peel-base)_60%,transparent)] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={springGentle}
        className="bevel-machined relative flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[var(--radius-stage)] p-5 sm:rounded-[var(--radius-stage)]"
      >
        <div className="flex items-start justify-between">
          <div className="leading-tight">
            <h3 className="text-lg font-semibold tracking-tight">Upload the receipt</h3>
            <p className="mt-1.5 text-[13px] text-ink-2">{sim.nameOf(by)} · {cfg.name} · cap {formatMoney(cap, cfg.currency)}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close" className="!px-2.5"><X className="size-4" /></Button>
        </div>

        <label className="block">
          <span className="micro-label">Amount you paid</span>
          <div className={cn("well-recessed mt-2 flex items-center gap-2 rounded-2xl px-4 py-3 transition-shadow", over && "ring-2 ring-coral")}>
            <span className="text-lg font-medium text-ink-3">{cfg.currency === "INR" ? "₹" : "kr"}</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full bg-transparent text-2xl font-semibold tabular-nums tracking-tight outline-none" aria-label="Amount" />
          </div>
          <AnimatePresence initial={false} mode="wait">
            <motion.p key={over ? "o" : "k"} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className={cn("mt-2 text-[12.5px]", over ? "text-coral" : "text-ink-3")}>
              {over ? `${formatMoney(minor - cap, cfg.currency)} over your cap. A lead has to approve it.` : `Within your cap of ${formatMoney(cap, cfg.currency)}.`}
            </motion.p>
          </AnimatePresence>
        </label>

        <div>
          <span className="micro-label">What did you buy?</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SNACK_CATALOG.map((s) => {
              const on = items.includes(s);
              return (
                <motion.button key={s} type="button" whileTap={{ scale: 0.94 }} transition={springTactile} onClick={() => setItems((x) => (on ? x.filter((i) => i !== s) : [...x, s]))} aria-pressed={on} className={cn("h-8 rounded-full px-3 text-[12.5px] outline-none transition-colors", on ? "bg-ink text-[var(--peel-base)]" : "field-fill text-ink-2 hover:text-ink")}>
                  {s}
                </motion.button>
              );
            })}
          </div>
        </div>

        <motion.button type="button" onClick={() => setPhoto((v) => !v)} whileTap={{ scale: 0.98 }} transition={springTactile} aria-pressed={photo} className={cn("flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-left text-[13px] outline-none transition-colors", photo ? "border-lime bg-lime/10 text-ink" : "border-line text-ink-2 hover:border-ink-3")}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={photo ? "c" : "m"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={springTactile} className="flex size-8 items-center justify-center rounded-full bg-raised">
              {photo ? <Check className="size-4 text-lime-ink" /> : <Camera className="size-4" />}
            </motion.span>
          </AnimatePresence>
          {photo ? "receipt.jpg attached" : "Attach a photo of the receipt"}
        </motion.button>

        <AnimatePresence initial={false}>
          {over && (
            <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={springGentle} className="flex cursor-pointer items-center gap-2.5 overflow-hidden text-[13px] text-ink-2">
              <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} className="size-4 accent-[var(--peel-hot)]" />
              A lead has approved going over budget for this receipt
            </motion.label>
          )}
        </AnimatePresence>

        <SlideToConfirm
          key={`${ready}`}
          disabled={!ready}
          label={ready ? "Slide to send claim to HR" : "Add amount, receipt and approval"}
          confirmedLabel="Sent"
          autoResetTimeout={900}
          className="!w-full !max-w-none"
          onConfirm={async () => {
            const ok = await sim.completeChecked(refill.id, by, minor, items, lead);
            if (ok) setTimeout(onClose, 450);
          }}
        />
      </motion.div>
    </div>
  );
}
