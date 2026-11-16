import { describe, expect, it } from "vitest";
import { D, H, MONDAY, TEAM, vol, world } from "./testing";

async function fullRefill(w: ReturnType<typeof world>, office: "OSL" | "BLR", amountMinor = 50_000, payNow = true) {
  const { refill: r } = await w.service.reportEmpty({ office, by: "x" });
  const who = (await w.service.get(r.id)).offeredTo!;
  await w.service.accept(r.id, who);
  await w.service.completePurchase(r.id, who, { amountMinor, items: [], receipt: "r.jpg" });
  if (payNow) {
    for (const id of w.hr.claims.keys()) w.hr.approve(id);
    await w.service.tick();
  }
  return who;
}

describe("choosing who buys", () => {
  it("rotates: everyone gets a turn before anyone gets a second one", async () => {
    const w = world();
    const buyers: string[] = [];
    for (let i = 0; i < 3; i++) buyers.push(await fullRefill(w, "OSL"));
    expect(new Set(buyers).size).toBe(3);
    // the fourth goes to whoever has waited longest = the first buyer
    expect(await fullRefill(w, "OSL")).toBe(buyers[0]);
  });

  it("skips people who are on holiday or whose office day is not today", async () => {
    const team = [
      vol("away", "OSL", { holidays: [{ from: MONDAY - D, to: MONDAY + 5 * D }] }),
      vol("wfh", "OSL", { officeDays: [2, 3] }), // Monday = remote
      vol("here", "OSL"),
    ];
    const w = world(team);
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "x" });
    expect(refill.offeredTo).toBe("here");
  });

  it("prefers someone in the office, and falls back to a remote colleague who can buy now", async () => {
    const team = [vol("home", "OSL", { officeDays: [2] }), vol("desk", "OSL")];
    const w = world(team);
    const first = await w.service.reportEmpty({ office: "OSL", by: "x" });
    expect(first.refill.offeredTo).toBe("desk");
    await w.service.decline(first.refill.id, "desk");
    expect((await w.service.get(first.refill.id)).offeredTo).toBe("home");
  });

  it("does not ask people from the other office, even when they have the lightest load", async () => {
    const w = world(TEAM());
    const c = await w.service.candidatesFor("OSL");
    expect(c.every((x) => x.volunteer.homeOffice === "OSL")).toBe(true);
  });

  it("never asks someone who already holds an open commitment", async () => {
    const w = world([vol("a", "OSL"), vol("b", "OSL")]);
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "x" });
    const who = refill.offeredTo!;
    await w.service.accept(refill.id, who);
    expect((await w.service.candidatesFor("OSL")).map((c) => c.volunteer.id)).toEqual(["b"]);
  });

  it("stops asking people who are still waiting for HR to pay them back", async () => {
    const w = world([vol("a", "OSL"), vol("b", "OSL"), vol("c", "OSL")], { maxOutstandingClaims: 1 });
    const first = await fullRefill(w, "OSL", 50_000, false); // claim stays pending
    const cands = await w.service.candidatesFor("OSL");
    expect(cands.map((c) => c.volunteer.id)).not.toContain(first);
    // once HR pays, they are back in the pool
    for (const id of w.hr.claims.keys()) w.hr.approve(id);
    await w.service.tick();
    expect((await w.service.candidatesFor("OSL")).map((c) => c.volunteer.id)).toContain(first);
  });

  it("skips someone owed too much, measured in the reporting currency across both offices", async () => {
    const w = world([vol("a", "BLR"), vol("b", "BLR")], { maxOwedReportingMinor: 20_000, maxOutstandingClaims: 9 });
    const first = await fullRefill(w, "BLR", 250_000, false); // ₹2 500 ≈ 308 NOK > 200 NOK limit
    expect((await w.service.candidatesFor("BLR")).map((c) => c.volunteer.id)).not.toContain(first);
  });

  it("explains its choice", async () => {
    const w = world();
    const [top] = await w.service.candidatesFor("OSL");
    expect(top.reasons.join(" ")).toMatch(/In the Oslo office today/);
    expect(top.reasons.join(" ")).toMatch(/No refills in the last 60 days/);
  });

  it("counts only refills inside the fairness window", async () => {
    const w = world([vol("a", "OSL"), vol("b", "OSL")]);
    const first = await fullRefill(w, "OSL");
    w.clock.advance(70 * D + 0 * H);
    await w.service.tick();
    const c = await w.service.candidatesFor("OSL");
    expect(c.find((x) => x.volunteer.id === first)!.stats.recentRefills).toBe(0);
  });
});
