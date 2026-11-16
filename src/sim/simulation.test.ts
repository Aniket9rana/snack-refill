import { describe, expect, it } from "vitest";
import { Simulation } from "./simulation";

describe("simulated offices", () => {
  it("six weeks of warm-up produce refills, spend inside the budgets, and a rotation across volunteers", async () => {
    const sim = new Simulation();
    await sim.init();
    const s = sim.getSnapshot();
    expect(s.ready).toBe(true);
    expect(s.refills.length).toBeGreaterThan(8);
    for (const o of ["OSL", "BLR"] as const) {
      const b = s.budgets[o];
      expect(b.spentMinor + b.reservedMinor).toBeLessThanOrEqual(b.budgetMinor);
    }
    // at most one open refill per office at any time
    for (const o of ["OSL", "BLR"] as const) {
      const open = s.refills.filter((r) => r.office === o && ["OFFERED", "ESCALATED", "COMMITTED", "BUDGET_HOLD"].includes(r.state));
      expect(open.length).toBeLessThanOrEqual(1);
    }
    const buyers = new Set(s.refills.filter((r) => r.purchase).map((r) => r.purchase!.by));
    expect(buyers.size).toBeGreaterThan(8);
    console.log(JSON.stringify({ refills: s.refills.length, states: s.refills.reduce((a: Record<string, number>, r) => ((a[r.state] = (a[r.state] ?? 0) + 1), a), {}), budgets: Object.values(s.budgets).map((b) => [b.office, b.spentMinor, b.reservedMinor, b.budgetMinor]) }));
  }, 30000);
});
