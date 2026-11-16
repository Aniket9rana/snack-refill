import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { D, H, TEAM, vol, world } from "./testing";

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof DomainError ? e.code : "OTHER";
  }
  return "NO_ERROR";
};

describe("one open refill per office", () => {
  it("two simultaneous 'it's empty' reports create exactly one refill and merge the items", async () => {
    const w = world();
    const [a, b] = await Promise.all([
      w.service.reportEmpty({ office: "OSL", by: "anna", items: ["Chips"] }),
      w.service.reportEmpty({ office: "OSL", by: "bjorn", items: ["Granola bars"] }),
    ]);
    const all = await w.service.list();
    expect(all).toHaveLength(1);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    const open = (await w.service.openRefill("OSL"))!;
    expect(open.itemsLow.sort()).toEqual(["Chips", "Granola bars"]);
    // exactly one person was asked
    expect(w.chat.ofKind("offer")).toHaveLength(1);
  });

  it("a report for the other office is independent", async () => {
    const w = world();
    await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const r = await w.service.reportEmpty({ office: "BLR", by: "dev" });
    expect(r.created).toBe(true);
    expect(await w.service.list()).toHaveLength(2);
  });
});

describe("two people cannot commit to the same refill", () => {
  it("only one of many simultaneous takers wins an escalated refill", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    await w.service.openToEveryone(refill.id, "lead");
    expect((await w.service.get(refill.id)).state).toBe("ESCALATED");

    const results = await Promise.allSettled(["anna", "bjorn", "camilla"].map((v) => w.service.accept(refill.id, v)));
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(2);
    lost.forEach((l) => expect((l.reason as DomainError).code).toBe("ALREADY_TAKEN"));

    const final = await w.service.get(refill.id);
    expect(final.state).toBe("COMMITTED");
    // one reservation, not three
    expect(w.ledger.all().filter((e) => e.kind === "reserved")).toHaveLength(1);
    // the losers were told politely
    expect(w.chat.ofKind("offer_reassigned").length).toBe(2);
  });

  it("tapping accept twice is harmless", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(refill.id)).offeredTo!;
    await w.service.accept(refill.id, who);
    await expect(w.service.accept(refill.id, who)).resolves.toMatchObject({ state: "COMMITTED" });
    expect(w.ledger.all()).toHaveLength(1);
  });

  it("a direct offer can only be accepted by the person it was sent to", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const offered = (await w.service.get(refill.id)).offeredTo!;
    const other = ["anna", "bjorn", "camilla"].find((v) => v !== offered)!;
    expect(await codeOf(w.service.accept(refill.id, other))).toBe("NOT_ALLOWED");
    // and someone from the other office can't take it either, even if escalated
    await w.service.openToEveryone(refill.id, "lead");
    expect(await codeOf(w.service.accept(refill.id, "dev"))).toBe("NOT_ALLOWED");
  });
});

describe("a refill nobody completes is handed to someone else", () => {
  it("declining passes it on and never asks the same person twice", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const asked: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await w.service.get(refill.id);
      if (r.state !== "OFFERED") break;
      asked.push(r.offeredTo!);
      await w.service.decline(refill.id, r.offeredTo!);
    }
    expect(new Set(asked).size).toBe(asked.length);
    expect((await w.service.get(refill.id)).state).toBe("ESCALATED");
  });

  it("an unanswered offer expires after 2 h and moves to the next person", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const first = (await w.service.get(refill.id)).offeredTo!;
    w.clock.advance(2 * H + 1);
    await w.service.tick();
    const r = await w.service.get(refill.id);
    expect(r.state).toBe("OFFERED");
    expect(r.offeredTo).not.toBe(first);
    expect(r.excluded).toContain(first);
    // the late accept is refused
    expect(await codeOf(w.service.accept(refill.id, first))).toBe("NOT_ALLOWED");
  });

  it("a committed buyer gets a reminder at half time, then loses the refill at 24 h and the money is released", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const first = (await w.service.get(refill.id)).offeredTo!;
    await w.service.accept(refill.id, first);
    expect(w.ledger.snapshot("OSL", "2026-11").reservedMinor).toBe(120_000);

    w.clock.advance(12 * H + 1);
    await w.service.tick();
    expect(w.chat.ofKind("reminder")).toHaveLength(1);
    await w.service.tick(); // idempotent: no second reminder
    expect(w.chat.ofKind("reminder")).toHaveLength(1);

    w.clock.advance(12 * H);
    await w.service.tick();
    const r = await w.service.get(refill.id);
    expect(r.state).toBe("OFFERED");
    expect(r.offeredTo).not.toBe(first);
    expect(r.commit).toBeUndefined();
    expect(r.excluded).toContain(first);
    expect(w.ledger.snapshot("OSL", "2026-11").reservedMinor).toBe(0);
    expect(w.chat.ofKind("commit_released")).toHaveLength(1);
  });

  it("when everyone has been tried the refill opens to everyone and the lead is told", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    for (let i = 0; i < 3; i++) {
      w.clock.advance(2 * H + 1);
      await w.service.tick();
    }
    expect((await w.service.get(refill.id)).state).toBe("ESCALATED");
    expect(w.chat.ofKind("escalation").length).toBeGreaterThanOrEqual(2); // channel + lead
  });

  it("with nobody available at all it escalates immediately instead of waiting in silence", async () => {
    const team = [vol("solo", "OSL", { holidays: [{ from: 0, to: Number.MAX_SAFE_INTEGER }] }), ...TEAM().filter((v) => v.homeOffice === "BLR")];
    const w = world(team);
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "x" });
    expect(refill.state).toBe("ESCALATED");
    expect(w.chat.ofKind("escalation")).toHaveLength(2);
  });
});

describe("tick is idempotent", () => {
  it("running it repeatedly without time passing changes nothing", async () => {
    const w = world();
    await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const before = JSON.stringify(await w.service.list());
    await w.service.tick();
    await w.service.tick();
    expect(JSON.stringify(await w.service.list())).toBe(before);
    expect(w.chat.sent.length).toBe(1);
  });

  it("an unrelated day passing does not reopen finished refills", async () => {
    const w = world();
    const { refill } = await w.service.reportEmpty({ office: "OSL", by: "anna" });
    const who = (await w.service.get(refill.id)).offeredTo!;
    await w.service.accept(refill.id, who);
    await w.service.completePurchase(refill.id, who, { amountMinor: 80_000, items: ["Chips"], receipt: "r.jpg" });
    w.clock.advance(11 * D);
    await w.service.tick();
    expect((await w.service.get(refill.id)).state).toBe("REIMBURSED");
  });
});
