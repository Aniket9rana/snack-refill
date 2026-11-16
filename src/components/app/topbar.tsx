"use client";

import { AnimatePresence, motion } from "motion/react";
import { CookingPot, Pause, Play, RotateCcw, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { SaveStatePill } from "@/components/ui/save-state-pill";
import { Toggle } from "@/components/ui/toggle";
import { ThemeToggle } from "./theme-toggle";
import { fmtDate, fmtTime } from "@/lib/format";
import { springTactile } from "@/lib/motion";
import type { Simulation, Snapshot } from "@/sim/simulation";

const HOUR = 3_600_000;
const SPEEDS = [
  { id: String(HOUR), label: "1 h / s" },
  { id: String(6 * HOUR), label: "6 h / s" },
  { id: String(24 * HOUR), label: "1 d / s" },
];

export function TopBar({ sim, snap }: { sim: Simulation; snap: Snapshot }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line-subtle bg-base/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[2200px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-8 xl:px-12">
        <div className="flex items-center gap-3">
          <span className="bevel-machined flex size-10 items-center justify-center rounded-[14px] text-ink">
            <CookingPot className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">Refill</p>
            <p className="micro-label mt-1">Snack desk · Oslo + Bengaluru</p>
          </div>
        </div>

        <div className="well-recessed flex items-center gap-3 rounded-2xl px-4 py-2">
          <div className="leading-none">
            <p className="micro-label">Simulated time</p>
            <p className="mt-1.5 flex items-baseline gap-2 font-mono text-[15px] font-medium tabular-nums text-ink">
              <span>{fmtDate(snap.now)}</span>
              <span className="text-ink-2">{fmtTime(snap.now)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="md" variant="primary" disabled={!snap.ready} onClick={() => (snap.running ? sim.pause() : sim.play())} aria-label={snap.running ? "Pause" : "Play"} className="w-[104px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={snap.running ? "p" : "r"} initial={{ opacity: 0, scale: 0.7, rotate: -20 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.7 }} transition={springTactile} className="inline-flex items-center gap-2">
                {snap.running ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
                {snap.running ? "Pause" : "Play"}
              </motion.span>
            </AnimatePresence>
          </Button>
          <FilterChips
            size="sm"
            options={SPEEDS}
            value={String(snap.speed)}
            onChange={(v) => sim.setSpeed(Number(v))}
          />
          <Button size="sm" variant="secondary" disabled={!snap.ready} onClick={() => sim.skip(HOUR)}>+1 h</Button>
          <Button size="sm" variant="secondary" disabled={!snap.ready} onClick={() => sim.skip(24 * HOUR)}>+1 day</Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <Toggle checked={snap.autopilot} onChange={(v) => sim.setAutopilot(v)} label="Volunteers respond automatically" />
            Autopilot
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <Toggle checked={snap.hrDown} onChange={(v) => sim.setHrDown(v)} label="Simulate HR outage" />
            <span className="inline-flex items-center gap-1.5"><ZapOff className="size-3.5" />HR outage</span>
          </label>
          <SaveStatePill state={snap.hrDown ? "failed" : "saved"} lastSavedAt={null} onRetry={() => sim.setHrDown(false)} />
          <Button size="sm" variant="ghost" onClick={() => sim.reset()} aria-label="Reset simulation"><RotateCcw className="size-3.5" />Reset</Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
