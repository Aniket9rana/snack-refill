import { describe, expect, it } from "vitest";
import { D, TEAM, world } from "./testing";

async function bought(w: ReturnType<typeof world>) {
  const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "x" });
  const who = (await w.service.get(r.id)).offeredTo!;
  await w.service.accept(r.id, who);
  return { id: r.id, who };
}

describe("HR claims", () => {
  it("submits the claim immediately with amount, currency, description, receipt and employee id", async () => {
    const w = world();
    const { id, who } = await bought(w);
    const r = await w.service.completePurchase(id, who, { amountMinor: 74_500, items: ["Chips"], receipt: "receipt-1.jpg" });
    expect(r.state).toBe("CLAIMED");
    const c = [...w.hr.claims.values()][0];
    expect(c.input).toMatchObject({ employeeId: who, amountMinor: 74_500, currency: "NOK", receipt: "receipt-1.jpg", idempotencyKey: `snack-refill:${id}` });
    expect(c.input.description).toMatch(/Oslo/);
  });

  it("keeps the receipt and retries when HR is down, and never creates a duplicate claim", async () => {
    const w = world();
    const { id, who } = await bought(w);
    w.hr.down = true;
    const r = await w.service.completePurchase(id, who, { amountMinor: 50_000, items: [], receipt: "r.jpg" });
    expect(r.state).toBe("PURCHASED");
    expect(r.claim!.lastError).toBeTruthy();
    expect(w.service.budget("OSL").spentMinor).toBe(50_000); // spend is booked even while HR is down
    await w.service.tick();
    await w.service.tick();
    expect((await w.service.get(id)).state).toBe("PURCHASED");

    w.hr.down = false;
    await w.service.tick();
    expect((await w.service.get(id)).state).toBe("CLAIMED");
    expect(w.hr.claims.size).toBe(1);
    // more ticks must not send it again
    const calls = w.hr.calls;
    await w.service.tick();
    expect(w.hr.calls).toBe(calls);
  });

  it("the idempotency key protects against a crash between 'HR accepted' and 'we saved it'", async () => {
    const w = world();
    const { id, who } = await bought(w);
    await w.service.completePurchase(id, who, { amountMinor: 50_000, items: [], receipt: "r.jpg" });
    const first = [...w.hr.claims.keys()][0];
    const again = await w.hr.createClaim([...w.hr.claims.values()][0].input);
    expect(again.claimId).toBe(first);
    expect(w.hr.claims.size).toBe(1);
  });

  it("marks the refill reimbursed after HR approves, paying in the employee's payroll currency", async () => {
    const w = world();
    const { id, who } = await bought(w);
    await w.service.completePurchase(id, who, { amountMinor: 50_000, items: [], receipt: "r.jpg" });
    w.clock.advance(1 * D);
    await w.service.tick();
    const mid = await w.service.get(id);
    if (mid.state === "CLAIMED") {
      w.clock.advance(10 * D);
      await w.service.tick();
    }
    const done = await w.service.get(id);
    expect(done.state).toBe("REIMBURSED");
    expect(done.reimbursement!.currency).toBe("NOK");
    expect(w.chat.ofKind("reimbursed")).toHaveLength(1);
  });

  it("voids the spend and tells the lead when HR rejects the claim", async () => {
    const w = world();
    const { id, who } = await bought(w);
    await w.service.completePurchase(id, who, { amountMinor: 50_000, items: [], receipt: "r.jpg" });
    w.hr.reject([...w.hr.claims.keys()][0]);
    await w.service.tick();
    expect((await w.service.get(id)).state).toBe("CLAIM_REJECTED");
    expect(w.service.budget("OSL").spentMinor).toBe(0);
    expect(w.chat.ofKind("claim_status").some((m) => "leads" in m.target)).toBe(true);
  });

  it("nudges the lead once if a claim is still pending after a week", async () => {
    const w = world();
    const { id, who } = await bought(w);
    await w.service.completePurchase(id, who, { amountMinor: 50_000, items: [], receipt: "r.jpg" });
    // Force HR to be slow so it is still pending after 7 days
    const claim = [...w.hr.claims.values()][0];
    claim.delayMs = 30 * D;
    w.clock.advance(7 * D + 1);
    await w.service.tick();
    await w.service.tick();
    expect(w.chat.ofKind("claim_nudge")).toHaveLength(1);
    expect(TEAM().length).toBe(6);
    expect((await w.service.get(id)).state).toBe("CLAIMED");
  });
});
