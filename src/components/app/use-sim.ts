"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Simulation, type Snapshot } from "@/sim/simulation";

const noop = () => () => {};
let loading: Snapshot | null = null;

export function useSim() {
  const [sim] = useState<Simulation | null>(() => (typeof window === "undefined" ? null : new Simulation()));
  const snap = useSyncExternalStore(
    sim ? sim.subscribe : noop,
    sim ? sim.getSnapshot : () => loading ?? (loading = new Simulation().getSnapshot()),
    () => loading ?? (loading = new Simulation().getSnapshot()),
  );
  useEffect(() => {
    if (!sim) return;
    void sim.init();
    return () => sim.pause();
  }, [sim]);
  return { sim: sim!, snap };
}
