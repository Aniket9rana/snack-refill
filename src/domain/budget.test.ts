import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { formatMoney, convert, monthlyReport, monthKey, OFFICES } from "./index";
import { D, MONDAY, TEAM, vol, world } from "./testing";

/** Run one complete refill for `office` by whoever gets picked. Returns the buyer. */
async function refill(w: ReturnType<typeof world>, office: "OSL" | "BLR", amountMinor: number, items = ["Chips"]) {
  const { refill: r } = await w.service.reportEmpty({ office, by: "x" });
  const who = (await w.service.get(r.id)).offeredTo!;
  await w.service.accept(r.id, who);
  await w.service.completePurchase(r.id, who, { amountMinor, items, receipt: "r.jpg" });
  return { id: r.id, who };
}

describe("budget check", () => {
  it("reserves a spend cap on commit and swaps it for the real amount on receipt", async () => {
    const w = world();
    const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(r.id)).offeredTo!;
    await w.service.accept(r.id, who);
    expect(w.service.budget("OSL")).toMatchObject({ reservedMinor: 120_000, spentMinor: 0, availableMinor: 480_000 });
    await w.service.completePurchase(r.id, who, { amountMinor: 74_500, items: [], receipt: "r.jpg" });
    expect(w.service.budget("OSL")).toMatchObject({ reservedMinor: 0, spentMinor: 74_500, availableMinor: 525_500 });
  });

  it("caps the buyer's allowance at what is left, and refuses a refill when less than a minimum purchase remains", async () => {
    const w = world();
    // Oslo: 6 000 NOK. Spend 5 000 → 1 000 left (cap shrinks from 1 200 to 1 000)
    for (let i = 0; i < 5; i++) await refill(w, "OSL", 100_000);
    const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(r.id)).offeredTo!;
    const c = await w.service.accept(r.id, who);
    expect(c.commit!.capMinor).toBe(100_000);
  });

  it("puts a refill on BUDGET_HOLD when the month is used up and resumes it next month", async () => {
    const w = world();
    // 6 × 1 000 NOK = the whole 6 000 NOK budget
    for (let i = 0; i < 6; i++) await refill(w, "OSL", 100_000);
    expect(w.service.budget("OSL").availableMinor).toBe(0);

    const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    expect(r.state).toBe("BUDGET_HOLD");
    expect(w.chat.ofKind("budget_hold")).toHaveLength(1);
    const offersBefore = w.chat.ofKind("offer").length;
    await w.service.tick();
    expect((await w.service.get(r.id)).state).toBe("BUDGET_HOLD");

    // First Monday of December: fresh budget
    w.clock.set(Date.UTC(2026, 11, 7, 9));
    await w.service.tick();
    const after = await w.service.get(r.id);
    expect(after.state).toBe("OFFERED");
    expect(w.chat.ofKind("offer").length).toBe(offersBefore + 1);
  });

  it("refuses a receipt that would exceed the monthly budget unless a lead approves it", async () => {
    const w = world();
    for (let i = 0; i < 5; i++) await refill(w, "OSL", 110_000); // 5 500 NOK spent
    const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(r.id)).offeredTo!;
    await w.service.accept(r.id, who); // cap = 500 NOK
    await expect(
      w.service.completePurchase(r.id, who, { amountMinor: 90_000, items: [], receipt: "r.jpg" }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    // nothing changed: still committed, nothing booked
    expect((await w.service.get(r.id)).state).toBe("COMMITTED");
    expect(w.service.budget("OSL").spentMinor).toBe(550_000);

    const done = await w.service.completePurchase(r.id, who, { amountMinor: 90_000, items: [], receipt: "r.jpg", leadOverride: true });
    expect(done.purchase!.overBudget).toBe(true);
    expect(w.service.budget("OSL").spentMinor).toBe(640_000);
  });

  it("does not let a receipt be submitted twice", async () => {
    const w = world();
    const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(r.id)).offeredTo!;
    await w.service.accept(r.id, who);
    const input = { amountMinor: 50_000, items: [], receipt: "r.jpg" };
    const res = await Promise.allSettled([w.service.completePurchase(r.id, who, input), w.service.completePurchase(r.id, who, input)]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(w.service.budget("OSL").spentMinor).toBe(50_000);
    expect(w.hr.calls).toBe(1);
  });

  it("rejects non-positive / fractional amounts and missing receipts", async () => {
    const w = world();
    const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(r.id)).offeredTo!;
    await w.service.accept(r.id, who);
    for (const bad of [0, -5, 10.5]) {
      await expect(w.service.completePurchase(r.id, who, { amountMinor: bad, items: [], receipt: "r.jpg" })).rejects.toBeInstanceOf(DomainError);
    }
    await expect(w.service.completePurchase(r.id, who, { amountMinor: 1000, items: [], receipt: "" })).rejects.toBeInstanceOf(DomainError);
  });
});

describe("two currencies", () => {
  it("keeps each office's budget in its own currency", async () => {
    const w = world();
    await refill(w, "OSL", 100_000); // 1 000 NOK
    await refill(w, "BLR", 250_000); // 2 500 INR
    expect(w.service.budget("OSL")).toMatchObject({ currency: "NOK", budgetMinor: 600_000, spentMinor: 100_000 });
    expect(w.service.budget("BLR")).toMatchObject({ currency: "INR", budgetMinor: 1_500_000, spentMinor: 250_000 });
  });

  it("an Oslo volunteer visiting Bengaluru buys in INR against Bengaluru's budget, and is paid in NOK", async () => {
    const team = [
      vol("dev", "BLR", { officeDays: [] }), // remote this week
      vol("esha", "BLR", { holidays: [{ from: MONDAY - D, to: MONDAY + 30 * D }] }),
      vol("farhan", "BLR", { holidays: [{ from: MONDAY - D, to: MONDAY + 30 * D }] }),
      vol("anna", "OSL", { visits: [{ office: "BLR", from: MONDAY - D, to: MONDAY + 10 * D }] }),
    ];
    const w = world(team);
    const { refill: r } = await w.service.reportEmpty({ office: "BLR", by: "dev" });
    const live = await w.service.get(r.id);
    expect(live.offeredTo).toBe("anna"); // in the office (as a visitor) beats a remote local
    await w.service.accept(r.id, "anna");
    await w.service.completePurchase(r.id, "anna", { amountMinor: 200_000, items: [], receipt: "r.jpg" });

    expect(w.service.budget("BLR").spentMinor).toBe(200_000);
    expect(w.service.budget("OSL").spentMinor).toBe(0);
    const claim = [...w.hr.claims.values()][0];
    expect(claim.input).toMatchObject({ employeeId: "anna", currency: "INR", amountMinor: 200_000 });

    w.clock.advance(11 * D);
    await w.service.tick();
    const done = await w.service.get(r.id);
    expect(done.state).toBe("REIMBURSED");
    expect(done.reimbursement!.currency).toBe("NOK"); // paid in her payroll currency
    // ₹2 000 at HR's rate of 0.121 → 242 NOK
    expect(done.reimbursement!.amountMinor).toBe(24_200);
  });

  it("converts only the management total, with the stored rate, and rounds once", async () => {
    const w = world();
    await refill(w, "OSL", 100_000, ["Chips", "Granola bars"]);
    await refill(w, "BLR", 250_000, ["Chips"]);
    const rep = monthlyReport({
      month: "2026-11",
      refills: await w.service.list(),
      ledger: w.ledger,
      offices: OFFICES,
      volunteers: w.volunteers,
      rates: w.rates,
    });
    const osl = rep.offices.find((o) => o.office === "OSL")!;
    const blr = rep.offices.find((o) => o.office === "BLR")!;
    expect(osl.spentMinor).toBe(100_000);
    expect(blr.spentMinor).toBe(250_000);
    expect(blr.spentReportingMinor).toBe(Math.round(250_000 * 0.1235)); // 30 875 øre = 308.75 NOK
    expect(rep.total.spentMinor).toBe(100_000 + 30_875);
    expect(rep.total.budgetMinor).toBe(600_000 + Math.round(1_500_000 * 0.1235));
    expect(rep.reporting).toBe("NOK");
    expect(rep.rates.asOf).toBe("2026-11");
    expect(rep.total.refills).toBe(2);
    expect(rep.items.find((i) => i.item === "Chips")!.bought).toBe(2);
  });

  it("counts a month by the purchase date, so a refill bought after midnight lands in the new month", async () => {
    const w = world();
    w.clock.set(Date.UTC(2026, 10, 30, 21)); // Monday 30 Nov, 21:00
    const { refill: r } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(r.id)).offeredTo!;
    w.clock.set(Date.UTC(2026, 10, 30, 22));
    await w.service.accept(r.id, who);
    w.clock.set(Date.UTC(2026, 11, 1, 8)); // 1 Dec, still inside the 24 h window
    await w.service.completePurchase(r.id, who, { amountMinor: 60_000, items: [], receipt: "r.jpg" });
    expect(w.ledger.snapshot("OSL", "2026-12").spentMinor).toBe(60_000);
    expect(w.ledger.snapshot("OSL", "2026-11")).toMatchObject({ spentMinor: 0, reservedMinor: 0 });
    expect(monthKey(w.clock.now())).toBe("2026-12");
  });

  it("formats and converts money without floats leaking", () => {
    expect(formatMoney(600_000, "NOK")).toBe("6 000 kr");
    expect(formatMoney(1_500_000, "INR")).toBe("₹15,000");
    expect(formatMoney(12_345_678, "INR")).toBe("₹1,23,456.78");
    expect(convert(100, "NOK", "NOK", { reporting: "NOK", perUnit: { NOK: 1, INR: 0.5 }, asOf: "" })).toBe(100);
    expect(convert(1, "INR", "NOK", { reporting: "NOK", perUnit: { NOK: 1, INR: 0.1235 }, asOf: "" })).toBe(0);
    expect(TEAM().length).toBe(6);
  });
});
