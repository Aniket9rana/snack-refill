import { DomainError } from "./errors";
import { monthKey } from "./money";
import type { Currency, OfficeConfig, OfficeId } from "./types";

export interface LedgerEntry {
  refillId: string;
  office: OfficeId;
  currency: Currency;
  month: string;
  kind: "reserved" | "spent" | "released" | "voided";
  amountMinor: number;
  overBudget: boolean;
}

export interface BudgetSnapshot {
  office: OfficeId;
  currency: Currency;
  month: string;
  budgetMinor: number;
  spentMinor: number;
  reservedMinor: number;
  availableMinor: number;
  utilisation: number; // (spent + reserved) / budget
}

/**
 * Per-office, per-month budget in the office's own currency. Money is only ever added up within one
 * currency; conversion happens in the report, never here.
 *
 * "Reserved" = the buyer's spend cap while a refill is committed. "Spent" = the receipt amount.
 * Spent + reserved can never exceed the budget unless a lead explicitly overrides.
 */
export class BudgetLedger {
  private entries = new Map<string, LedgerEntry>();
  constructor(private offices: Record<OfficeId, OfficeConfig>) {}

  private sum(office: OfficeId, month: string, kinds: LedgerEntry["kind"][], skip?: string) {
    let t = 0;
    for (const e of this.entries.values()) {
      if (e.office === office && e.month === month && kinds.includes(e.kind) && e.refillId !== skip) t += e.amountMinor;
    }
    return t;
  }

  snapshot(office: OfficeId, month: string): BudgetSnapshot {
    const cfg = this.offices[office];
    const spent = this.sum(office, month, ["spent"]);
    const reserved = this.sum(office, month, ["reserved"]);
    return {
      office,
      currency: cfg.currency,
      month,
      budgetMinor: cfg.monthlyBudgetMinor,
      spentMinor: spent,
      reservedMinor: reserved,
      availableMinor: cfg.monthlyBudgetMinor - spent - reserved,
      utilisation: (spent + reserved) / cfg.monthlyBudgetMinor,
    };
  }

  available(office: OfficeId, month: string) {
    return this.snapshot(office, month).availableMinor;
  }

  /** Reserve a spend cap. Atomic: throws if it does not fit in what is left. */
  reserve(refillId: string, office: OfficeId, month: string, amountMinor: number) {
    if (amountMinor <= 0) throw new DomainError("INVALID_INPUT", "Reservation must be positive");
    const existing = this.entries.get(refillId);
    if (existing && existing.kind === "reserved") return existing; // idempotent
    if (amountMinor > this.available(office, month)) {
      throw new DomainError("BUDGET_EXCEEDED", "Not enough budget left this month");
    }
    const e: LedgerEntry = {
      refillId,
      office,
      currency: this.offices[office].currency,
      month,
      kind: "reserved",
      amountMinor,
      overBudget: false,
    };
    this.entries.set(refillId, e);
    return e;
  }

  /** Would booking `actualMinor` for this refill in `month` push the office over budget? (ignores its own entry) */
  wouldExceed(refillId: string, office: OfficeId, month: string, actualMinor: number) {
    return this.sum(office, month, ["spent", "reserved"], refillId) + actualMinor > this.offices[office].monthlyBudgetMinor;
  }

  /** Replace the cap with the real receipt amount, booked in the month of purchase. */
  settle(refillId: string, office: OfficeId, month: string, actualMinor: number, leadOverride = false) {
    if (actualMinor <= 0) throw new DomainError("INVALID_INPUT", "Amount must be positive");
    const cfg = this.offices[office];
    // What is committed in the target month without this refill's own entry.
    const others = this.sum(office, month, ["spent", "reserved"], refillId);
    const over = others + actualMinor > cfg.monthlyBudgetMinor;
    if (over && !leadOverride) throw new DomainError("BUDGET_EXCEEDED", "This receipt would exceed the monthly budget");
    const e: LedgerEntry = {
      refillId,
      office,
      currency: cfg.currency,
      month,
      kind: "spent",
      amountMinor: actualMinor,
      overBudget: over,
    };
    this.entries.set(refillId, e);
    return e;
  }

  /** Commitment dropped: give the money back to the pool. */
  release(refillId: string) {
    const e = this.entries.get(refillId);
    if (e && e.kind === "reserved") this.entries.set(refillId, { ...e, kind: "released" });
  }

  /** HR rejected the claim: it no longer counts as spend. */
  void(refillId: string) {
    const e = this.entries.get(refillId);
    if (e && e.kind === "spent") this.entries.set(refillId, { ...e, kind: "voided" });
  }

  all() {
    return [...this.entries.values()];
  }
  monthOf(ms: number) {
    return monthKey(ms);
  }
}
