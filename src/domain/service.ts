import { DomainError, VersionConflict } from "./errors";
import { convert, formatMoney, monthKey, type Rates } from "./money";
import type { BudgetLedger, BudgetSnapshot } from "./ledger";
import type { ChatMessage, ChatPort, Clock, HrPort, RefillRepo } from "./ports";
import { rankCandidates, statsFor, type Candidate } from "./picker";
import { availabilityTier } from "./presence";
import {
  OPEN_STATES,
  type OfficeConfig,
  type OfficeId,
  type Policy,
  type Refill,
  type HistoryType,
  type Volunteer,
} from "./types";

export interface Deps {
  repo: RefillRepo;
  chat: ChatPort;
  hr: HrPort;
  clock: Clock;
  ledger: BudgetLedger;
  volunteers: Volunteer[];
  offices: Record<OfficeId, OfficeConfig>;
  policy: Policy;
  rates: Rates;
  newId: () => string;
}

export interface PurchaseInput {
  amountMinor: number;
  items: string[];
  receipt: string;
  /** A lead has approved going over the monthly budget for this receipt. */
  leadOverride?: boolean;
}

/**
 * The refill lifecycle:
 *
 *   report ─► OFFERED ─(accept)─► COMMITTED ─(receipt)─► PURCHASED ─(HR has it)─► CLAIMED ─► REIMBURSED
 *               │  ▲                  │                      │ (HR down: retried)        └► CLAIM_REJECTED
 *   decline/timeout│                  └─ deadline missed ────┘
 *               ▼  │
 *            next person … after maxDirectOffers ─► ESCALATED (anyone eligible, first CAS wins)
 *   no budget ─► BUDGET_HOLD ─(new month / budget back)─► offering resumes
 *
 * Every state change is a compare-and-set on `version`; chat messages are sent only AFTER the write succeeded.
 */
export class RefillService {
  constructor(private d: Deps) {}

  // ───────────────────────── helpers ─────────────────────────
  private now() {
    return this.d.clock.now();
  }
  private vol(id: string) {
    const v = this.d.volunteers.find((x) => x.id === id);
    if (!v) throw new DomainError("NOT_FOUND", `Unknown volunteer ${id}`);
    return v;
  }
  private name(id: string) {
    return this.d.volunteers.find((x) => x.id === id)?.name ?? id;
  }
  private async load(id: string) {
    const r = await this.d.repo.get(id);
    if (!r) throw new DomainError("NOT_FOUND", `Unknown refill ${id}`);
    return r;
  }
  private log(r: Refill, type: HistoryType, by?: string, note?: string) {
    r.history.push({ at: this.now(), type, by, note });
  }
  private async flush(msgs: ChatMessage[]) {
    for (const m of msgs) await this.d.chat.send(m);
  }
  private money(office: OfficeId, minor: number) {
    return formatMoney(minor, this.d.offices[office].currency);
  }
  private officeName = (id: OfficeId) => this.d.offices[id].name;

  budget(office: OfficeId, at = this.now()): BudgetSnapshot {
    return this.d.ledger.snapshot(office, monthKey(at));
  }

  async candidatesFor(office: OfficeId, exclude: string[] = []): Promise<Candidate[]> {
    return rankCandidates({
      office,
      volunteers: this.d.volunteers,
      refills: await this.d.repo.list(),
      at: this.now(),
      policy: this.d.policy,
      rates: this.d.rates,
      exclude,
      officeName: this.officeName,
    });
  }

  /** Pick the next person (or escalate). Mutates the draft; returns the chat messages to send after it is saved. */
  private assign(r: Refill, all: Refill[]): ChatMessage[] {
    const cands = rankCandidates({
      office: r.office,
      volunteers: this.d.volunteers,
      refills: all.filter((x) => x.id !== r.id),
      at: this.now(),
      policy: this.d.policy,
      rates: this.d.rates,
      exclude: r.excluded,
      officeName: this.officeName,
    });
    const best = cands[0];
    if (!best || r.directOffers >= this.d.policy.maxDirectOffers) {
      r.state = "ESCALATED";
      r.offeredTo = undefined;
      r.offerExpiresAt = undefined;
      this.log(r, "escalated", undefined, best ? "Direct offers used up" : "Nobody eligible right now");
      const cfg = this.d.offices[r.office];
      return [
        {
          target: { channel: r.office },
          kind: "escalation",
          refillId: r.id,
          office: r.office,
          text: `The ${cfg.name} snack box still needs a refill. First to tap "I'll take it" gets it. Spend cap ${this.money(r.office, cfg.typicalMaxMinor)}.`,
          actions: ["take"],
        },
        {
          target: { leads: r.office },
          kind: "escalation",
          refillId: r.id,
          office: r.office,
          text: `No one has taken the ${cfg.name} refill. It is now open to everyone eligible.`,
        },
      ];
    }
    r.state = "OFFERED";
    r.offeredTo = best.volunteer.id;
    r.offerExpiresAt = this.now() + this.d.policy.offerTtlMs;
    r.directOffers += 1;
    this.log(r, "offered", best.volunteer.id, best.reasons.join(" · "));
    const cfg = this.d.offices[r.office];
    return [
      {
        target: { user: best.volunteer.id },
        kind: "offer",
        refillId: r.id,
        office: r.office,
        text: `The ${cfg.name} snack box is empty${r.itemsLow.length ? ` (${r.itemsLow.join(", ")})` : ""}. Can you refill it? Spend up to ${this.money(r.office, cfg.typicalMaxMinor)}. Please answer within 2 hours.`,
        actions: ["accept", "decline"],
      },
    ];
  }

  // ───────────────────────── commands ─────────────────────────

  /** Anyone can say the box is empty. At most one open refill exists per office, so a second report just joins it. */
  async reportEmpty(input: { office: OfficeId; by: string; items?: string[] }): Promise<{ refill: Refill; created: boolean }> {
    const { office, by } = input;
    const items = input.items ?? [];
    const join = async () => {
      for (let i = 0; i < 3; i++) {
        const open = (await this.d.repo.list()).find((r) => r.office === office && OPEN_STATES.includes(r.state));
        if (!open) return undefined;
        const merged = [...new Set([...open.itemsLow, ...items])];
        if (merged.length === open.itemsLow.length) return open;
        try {
          const next = { ...open, itemsLow: merged };
          await this.d.repo.save(next, open.version);
          return { ...next, version: open.version + 1 };
        } catch (e) {
          if (!(e instanceof VersionConflict)) throw e;
        }
      }
      return (await this.d.repo.list()).find((r) => r.office === office && OPEN_STATES.includes(r.state));
    };

    const existing = await join();
    if (existing) return { refill: existing, created: false };

    const all = await this.d.repo.list();
    const cfg = this.d.offices[office];
    const month = monthKey(this.now());
    const r: Refill = {
      id: this.d.newId(),
      office,
      version: 1,
      state: "OFFERED",
      reportedBy: by,
      reportedAt: this.now(),
      itemsLow: [...new Set(items)],
      directOffers: 0,
      excluded: [],
      history: [],
    };
    this.log(r, "reported", by, items.join(", ") || undefined);
    let msgs: ChatMessage[];
    if (this.d.ledger.available(office, month) < cfg.typicalMinMinor) {
      r.state = "BUDGET_HOLD";
      this.log(r, "budget_hold", undefined, "Monthly budget used up");
      msgs = [this.holdMessage(r)];
    } else {
      msgs = this.assign(r, all);
    }
    try {
      await this.d.repo.insert(r);
    } catch (e) {
      if (!(e instanceof VersionConflict)) throw e;
      // Lost the race with another report: join theirs.
      const winner = await join();
      if (winner) return { refill: winner, created: false };
      throw e;
    }
    await this.flush(msgs);
    return { refill: (await this.d.repo.get(r.id))!, created: true };
  }

  private holdMessage(r: Refill): ChatMessage {
    const b = this.budget(r.office);
    return {
      target: { leads: r.office },
      kind: "budget_hold",
      refillId: r.id,
      office: r.office,
      text: `${this.officeName(r.office)} has used its snack budget (${this.money(r.office, b.spentMinor + b.reservedMinor)} of ${this.money(r.office, b.budgetMinor)}). The refill waits for next month unless you raise the budget.`,
    };
  }

  /** Volunteer says yes (to an offer, or to an escalated refill). Exactly one person can win. */
  async accept(refillId: string, volunteerId: string): Promise<Refill> {
    const v = this.vol(volunteerId);
    const r = await this.load(refillId);
    const all = await this.d.repo.list();
    const cfg = this.d.offices[r.office];

    if (r.state === "COMMITTED") {
      if (r.commit?.by === volunteerId) return r; // double tap: idempotent
      throw new DomainError("ALREADY_TAKEN", `${this.name(r.commit!.by)} already took this refill`);
    }
    if (r.state === "OFFERED") {
      if (r.offeredTo !== volunteerId) throw new DomainError("NOT_ALLOWED", "This offer is for someone else");
      if (this.now() >= (r.offerExpiresAt ?? 0)) throw new DomainError("INVALID_STATE", "This offer has expired");
    } else if (r.state === "ESCALATED") {
      const tier = availabilityTier(v, r.office, this.now());
      const st = statsFor(v, all, this.now(), this.d.policy, this.d.rates);
      if (!tier || r.excluded.includes(volunteerId) || st.busy) {
        throw new DomainError("NOT_ALLOWED", "You are not available for this refill right now");
      }
    } else {
      throw new DomainError("INVALID_STATE", `Refill is ${r.state}`);
    }

    const month = monthKey(this.now());
    const available = this.d.ledger.available(r.office, month);
    if (available < cfg.typicalMinMinor) {
      await this.toBudgetHold(r);
      throw new DomainError("BUDGET_EXCEEDED", "Not enough budget left this month");
    }
    const capMinor = Math.min(cfg.typicalMaxMinor, available);

    const next: Refill = structuredClone(r);
    next.state = "COMMITTED";
    next.offeredTo = undefined;
    next.offerExpiresAt = undefined;
    next.commit = { by: volunteerId, at: this.now(), deadline: this.now() + this.d.policy.commitWindowMs, capMinor, reminded: false };
    this.log(next, "committed", volunteerId, `Cap ${this.money(r.office, capMinor)}`);
    try {
      await this.d.repo.save(next, r.version);
    } catch (e) {
      if (e instanceof VersionConflict) {
        const now = await this.d.repo.get(refillId);
        await this.d.chat.send({
          target: { user: volunteerId },
          kind: "offer_reassigned",
          refillId,
          office: r.office,
          text: `Too late: ${now?.commit ? this.name(now.commit.by) : "someone else"} just took the ${cfg.name} refill. Thanks for jumping in!`,
        });
        throw new DomainError("ALREADY_TAKEN", `${now?.commit ? this.name(now.commit.by) : "Someone else"} already took this refill`);
      }
      throw e;
    }
    this.d.ledger.reserve(refillId, r.office, month, capMinor);
    await this.d.chat.send({
      target: { user: volunteerId },
      kind: "committed",
      refillId,
      office: r.office,
      text: `You've got it. Spend up to ${this.money(r.office, capMinor)}, then upload the receipt within 24 hours. Pay with your own money; HR reimburses you in ${v.payrollCurrency}.`,
      actions: ["complete"],
    });
    return (await this.d.repo.get(refillId))!;
  }

  private async toBudgetHold(r: Refill) {
    if (r.state === "BUDGET_HOLD") return;
    const next = structuredClone(r);
    next.state = "BUDGET_HOLD";
    next.offeredTo = undefined;
    next.offerExpiresAt = undefined;
    this.log(next, "budget_hold", undefined, "Budget used up while waiting");
    try {
      await this.d.repo.save(next, r.version);
      await this.d.chat.send(this.holdMessage(next));
    } catch (e) {
      if (!(e instanceof VersionConflict)) throw e;
    }
  }

  async decline(refillId: string, volunteerId: string): Promise<Refill> {
    const r = await this.load(refillId);
    if (r.state !== "OFFERED" || r.offeredTo !== volunteerId) {
      throw new DomainError("INVALID_STATE", "There is no open offer for you on this refill");
    }
    const next = structuredClone(r);
    next.excluded.push(volunteerId);
    this.log(next, "declined", volunteerId);
    const msgs = this.assign(next, await this.d.repo.list());
    await this.d.repo.save(next, r.version);
    await this.flush(msgs);
    return (await this.d.repo.get(refillId))!;
  }

  /** A lead (or the "box has been empty a while" rule) opens an offered refill to every eligible volunteer. */
  async openToEveryone(refillId: string, by: string): Promise<Refill> {
    const r = await this.load(refillId);
    if (r.state !== "OFFERED") throw new DomainError("INVALID_STATE", `Refill is ${r.state}`);
    const next = structuredClone(r);
    next.directOffers = this.d.policy.maxDirectOffers;
    const msgs = this.assign(next, await this.d.repo.list());
    this.log(next, "escalated", by, "Opened by a lead");
    await this.d.repo.save(next, r.version);
    await this.flush(msgs);
    return (await this.d.repo.get(refillId))!;
  }

  /** Receipt is in. Book the spend, store the receipt, send the claim to HR (retried by tick() if HR is down). */
  async completePurchase(refillId: string, volunteerId: string, input: PurchaseInput): Promise<Refill> {
    this.vol(volunteerId);
    const r = await this.load(refillId);
    if (r.state !== "COMMITTED") throw new DomainError("INVALID_STATE", `Refill is ${r.state}`);
    if (r.commit?.by !== volunteerId) throw new DomainError("NOT_ALLOWED", "This refill is not yours");
    if (!input.receipt) throw new DomainError("INVALID_INPUT", "A receipt image is required");
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new DomainError("INVALID_INPUT", "Amount must be a positive whole number of minor units");
    }
    const cfg = this.d.offices[r.office];
    const month = monthKey(this.now());
    const before = this.d.ledger.snapshot(r.office, month);

    // Dry run first, so a refused receipt leaves everything untouched.
    const wouldBeOver = this.d.ledger.wouldExceed(refillId, r.office, month, input.amountMinor);
    if (wouldBeOver && !input.leadOverride) {
      throw new DomainError("BUDGET_EXCEEDED", `This receipt would take ${cfg.name} over its monthly budget. A lead must approve it.`);
    }

    const next = structuredClone(r);
    next.state = "PURCHASED";
    next.purchase = {
      by: volunteerId,
      at: this.now(),
      amountMinor: input.amountMinor,
      currency: cfg.currency,
      items: input.items,
      receipt: input.receipt,
      overBudget: wouldBeOver,
    };
    next.claim = { attempts: 0, reminded: false };
    this.log(next, "purchased", volunteerId, this.money(r.office, input.amountMinor));
    await this.d.repo.save(next, r.version); // double submit loses here with VersionConflict
    this.d.ledger.settle(refillId, r.office, month, input.amountMinor, !!input.leadOverride);

    const after = this.d.ledger.snapshot(r.office, month);
    const msgs: ChatMessage[] = [];
    if (before.utilisation < 0.8 && after.utilisation >= 0.8) {
      msgs.push({
        target: { leads: r.office },
        kind: "budget_warning",
        refillId,
        office: r.office,
        text: `${cfg.name} snack budget is ${Math.round(after.utilisation * 100)}% used (${this.money(r.office, after.spentMinor + after.reservedMinor)} of ${this.money(r.office, after.budgetMinor)}).`,
      });
    }
    await this.flush(msgs);
    await this.submitClaim(refillId);
    return (await this.d.repo.get(refillId))!;
  }

  /** Send the claim to HR. Safe to call repeatedly: the idempotency key is the refill id. */
  private async submitClaim(refillId: string) {
    const r = await this.load(refillId);
    if (r.state !== "PURCHASED" || !r.purchase) return;
    const p = r.purchase;
    const next = structuredClone(r);
    next.claim = { ...(r.claim ?? { reminded: false }), attempts: (r.claim?.attempts ?? 0) + 1 } as NonNullable<Refill["claim"]>;
    try {
      const { claimId } = await this.d.hr.createClaim({
        idempotencyKey: `snack-refill:${r.id}`,
        employeeId: p.by,
        amountMinor: p.amountMinor,
        currency: p.currency,
        description: `Office snacks, ${this.officeName(r.office)} (${p.items.join(", ") || "snack refill"})`,
        receipt: p.receipt,
      });
      next.state = "CLAIMED";
      next.claim.id = claimId;
      next.claim.submittedAt = this.now();
      next.claim.lastError = undefined;
      this.log(next, "claim_sent", p.by, claimId);
      await this.d.repo.save(next, r.version);
      await this.d.chat.send({
        target: { user: p.by },
        kind: "claim_status",
        refillId,
        office: r.office,
        text: `Thanks! Your claim for ${this.money(r.office, p.amountMinor)} is with HR (${claimId}). Approval usually takes 1–10 days, and you're paid in ${this.vol(p.by).payrollCurrency}.`,
      });
    } catch (e) {
      if (e instanceof VersionConflict) return;
      next.claim.lastError = e instanceof Error ? e.message : String(e);
      this.log(next, "claim_retry", p.by, next.claim.lastError);
      try {
        await this.d.repo.save(next, r.version);
      } catch (e2) {
        if (!(e2 instanceof VersionConflict)) throw e2;
      }
    }
  }

  // ───────────────────────── the clock ─────────────────────────

  /** Run on a schedule (every few minutes). Idempotent: running it twice in a row changes nothing the second time. */
  async tick(): Promise<void> {
    const now = this.now();
    const pol = this.d.policy;
    for (const snap of await this.d.repo.list()) {
      try {
        switch (snap.state) {
          case "OFFERED":
            if (now >= (snap.offerExpiresAt ?? Infinity)) await this.offerExpired(snap);
            break;
          case "COMMITTED":
            await this.commitTick(snap);
            break;
          case "BUDGET_HOLD":
            if (this.d.ledger.available(snap.office, monthKey(now)) >= this.d.offices[snap.office].typicalMinMinor) {
              const next = structuredClone(snap);
              this.log(next, "budget_resume", undefined, "Budget available again");
              const msgs = this.assign(next, await this.d.repo.list());
              await this.d.repo.save(next, snap.version);
              await this.flush(msgs);
            }
            break;
          case "ESCALATED": {
            const lastPing = [...snap.history].reverse().find((h) => h.type === "escalated")?.at ?? snap.reportedAt;
            if (now - lastPing >= 24 * 3_600_000) {
              const next = structuredClone(snap);
              this.log(next, "escalated", undefined, "Still open after 24 h: pinged again");
              await this.d.repo.save(next, snap.version);
              await this.d.chat.send({
                target: { leads: snap.office },
                kind: "escalation",
                refillId: snap.id,
                office: snap.office,
                text: `The ${this.officeName(snap.office)} box has been waiting more than a day. Can a lead pick someone?`,
              });
            }
            break;
          }
          case "PURCHASED":
            if ((snap.claim?.attempts ?? 0) < pol.maxClaimAttempts) await this.submitClaim(snap.id);
            break;
          case "CLAIMED":
            await this.pollClaim(snap);
            break;
          default:
            break;
        }
      } catch (e) {
        if (e instanceof VersionConflict) continue; // someone else moved it; next tick sees the new state
        throw e;
      }
    }
  }

  private async offerExpired(r: Refill) {
    const next = structuredClone(r);
    const who = r.offeredTo!;
    next.excluded.push(who);
    this.log(next, "offer_expired", who);
    const msgs = this.assign(next, await this.d.repo.list());
    await this.d.repo.save(next, r.version);
    await this.d.chat.send({
      target: { user: who },
      kind: "offer_reassigned",
      refillId: r.id,
      office: r.office,
      text: "No problem, no answer in 2 hours so we asked someone else.",
    });
    await this.flush(msgs);
  }

  private async commitTick(r: Refill) {
    const c = r.commit!;
    const now = this.now();
    if (now >= c.deadline) {
      const next = structuredClone(r);
      next.excluded.push(c.by);
      next.commit = undefined;
      this.log(next, "commit_expired", c.by);
      const msgs = this.assign(next, await this.d.repo.list());
      await this.d.repo.save(next, r.version);
      this.d.ledger.release(r.id);
      await this.d.chat.send({
        target: { user: c.by },
        kind: "commit_released",
        refillId: r.id,
        office: r.office,
        text: "The 24 hours are up, so we handed the refill to someone else. If you already bought snacks, tell your lead.",
      });
      await this.flush(msgs);
      return;
    }
    if (!c.reminded && now >= c.at + this.d.policy.commitWindowMs * this.d.policy.reminderAt) {
      const next = structuredClone(r);
      next.commit!.reminded = true;
      this.log(next, "reminded", c.by);
      await this.d.repo.save(next, r.version);
      await this.d.chat.send({
        target: { user: c.by },
        kind: "reminder",
        refillId: r.id,
        office: r.office,
        text: `Reminder: the ${this.officeName(r.office)} box is still empty. Receipt due in ${Math.max(1, Math.round((c.deadline - now) / 3_600_000))} h, or we pass it on.`,
        actions: ["complete"],
      });
    }
  }

  private async pollClaim(r: Refill) {
    if (!r.claim?.id || !r.purchase) return;
    const st = await this.d.hr.getClaim(r.claim.id);
    const next = structuredClone(r);
    if (st.status === "approved") {
      next.state = "REIMBURSED";
      next.reimbursement = { at: st.at, amountMinor: st.payoutMinor, currency: st.payoutCurrency };
      this.log(next, "reimbursed", r.purchase.by, formatMoney(st.payoutMinor, st.payoutCurrency));
      await this.d.repo.save(next, r.version);
      await this.d.chat.send({
        target: { user: r.purchase.by },
        kind: "reimbursed",
        refillId: r.id,
        office: r.office,
        text: `Paid back: ${formatMoney(st.payoutMinor, st.payoutCurrency)} is on its way to you. Thank you!`,
      });
    } else if (st.status === "rejected") {
      next.state = "CLAIM_REJECTED";
      this.log(next, "claim_rejected", undefined, st.reason);
      await this.d.repo.save(next, r.version);
      this.d.ledger.void(r.id);
      await this.d.chat.send({
        target: { leads: r.office },
        kind: "claim_status",
        refillId: r.id,
        office: r.office,
        text: `HR rejected ${this.name(r.purchase.by)}'s claim (${st.reason}). Please sort it out so they are not left out of pocket.`,
      });
    } else if (!r.claim.reminded && this.now() - (r.claim.submittedAt ?? this.now()) >= this.d.policy.claimReminderMs) {
      next.claim!.reminded = true;
      this.log(next, "claim_reminder", undefined, "Pending over 7 days");
      await this.d.repo.save(next, r.version);
      await this.d.chat.send({
        target: { leads: r.office },
        kind: "claim_nudge",
        refillId: r.id,
        office: r.office,
        text: `${this.name(r.purchase.by)}'s claim has been with HR for over a week. Worth a nudge.`,
      });
    }
  }

  // ───────────────────────── queries ─────────────────────────
  async list() {
    return (await this.d.repo.list()).sort((a, b) => b.reportedAt - a.reportedAt);
  }
  async get(id: string) {
    return this.load(id);
  }
  async openRefill(office: OfficeId) {
    return (await this.d.repo.list()).find((r) => r.office === office && OPEN_STATES.includes(r.state));
  }
  /** What is each volunteer owed, and how loaded are they? Used by the roster and by the picker. */
  async stats() {
    const all = await this.d.repo.list();
    return Object.fromEntries(
      this.d.volunteers.map((v) => [v.id, statsFor(v, all, this.now(), this.d.policy, this.d.rates)]),
    );
  }
  convertToReporting(minor: number, from: OfficeConfig["currency"]) {
    return convert(minor, from, this.d.rates.reporting, this.d.rates);
  }
}
