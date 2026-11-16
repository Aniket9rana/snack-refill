/** Core vocabulary. Money is ALWAYS integer minor units (øre / paise) plus a currency, never a float. */

export type OfficeId = "OSL" | "BLR";
export type Currency = "NOK" | "INR";

export interface OfficeConfig {
  id: OfficeId;
  name: string;
  currency: Currency;
  /** Monthly budget in minor units of `currency`. */
  monthlyBudgetMinor: number;
  /** Typical purchase range (minor units): the min gates "is there enough budget at all", the max is the spend cap. */
  typicalMinMinor: number;
  typicalMaxMinor: number;
}

export interface Policy {
  /** How long one person has to answer an offer. */
  offerTtlMs: number;
  /** How long a committed volunteer has to buy + upload the receipt. */
  commitWindowMs: number;
  /** Nudge the buyer once this much of the window has passed (0..1). */
  reminderAt: number;
  /** After this many direct offers nobody took, open it to everyone eligible and tell the lead. */
  maxDirectOffers: number;
  /** A volunteer owed money on more than this many unpaid claims is skipped (the "same people carry everything" guard). */
  maxOutstandingClaims: number;
  /** ...or owed more than this, expressed in the reporting currency's minor units. */
  maxOwedReportingMinor: number;
  /** Window used to count "recent refills" for fairness. */
  fairnessWindowMs: number;
  /** Nudge HR when a claim is still pending after this long. */
  claimReminderMs: number;
  /** Receipt retries to HR happen on every tick; stop nagging after this many. */
  maxClaimAttempts: number;
}

export interface Holiday {
  from: number;
  to: number;
}
export interface Visit {
  office: OfficeId;
  from: number;
  to: number;
}

export interface Volunteer {
  /** Also the HR employee id. */
  id: string;
  name: string;
  homeOffice: OfficeId;
  payrollCurrency: Currency;
  /** Weekdays (0 = Sunday) the person normally works from the office. Other weekdays = remote. */
  officeDays: number[];
  holidays: Holiday[];
  visits: Visit[];
}

export type Presence =
  | { kind: "office"; office: OfficeId; visiting: boolean }
  | { kind: "remote"; home: OfficeId }
  | { kind: "holiday" }
  | { kind: "off" };

export type RefillState =
  | "OFFERED" // exactly one person has been asked, until offerExpiresAt
  | "ESCALATED" // nobody took it: open to every eligible volunteer, first one wins
  | "COMMITTED" // one person owns it, until commit.deadline
  | "BUDGET_HOLD" // month budget used up: waits for the next month or a lead decision
  | "PURCHASED" // receipt in, claim not yet accepted by HR (retry outbox)
  | "CLAIMED" // HR has the claim, waiting for approval
  | "REIMBURSED" // HR approved and paid
  | "CLAIM_REJECTED" // HR rejected: spend voided, needs a human
  | "CANCELLED";

/** States where the box still needs snacks. At most ONE refill per office may be in these states. */
export const OPEN_STATES: readonly RefillState[] = ["OFFERED", "ESCALATED", "COMMITTED", "BUDGET_HOLD"];
export const TERMINAL_STATES: readonly RefillState[] = ["REIMBURSED", "CLAIM_REJECTED", "CANCELLED"];

export type HistoryType =
  | "reported"
  | "offered"
  | "declined"
  | "offer_expired"
  | "escalated"
  | "committed"
  | "reminded"
  | "commit_expired"
  | "budget_hold"
  | "budget_resume"
  | "purchased"
  | "claim_sent"
  | "claim_retry"
  | "claim_reminder"
  | "reimbursed"
  | "claim_rejected"
  | "race_lost"
  | "cancelled";

export interface HistoryEntry {
  at: number;
  type: HistoryType;
  by?: string;
  note?: string;
}

export interface Refill {
  id: string;
  office: OfficeId;
  /** Optimistic-lock counter: every successful write bumps it; writes must present the version they read. */
  version: number;
  state: RefillState;
  reportedBy: string;
  reportedAt: number;
  /** Snacks that ran out (demand signal for the report). */
  itemsLow: string[];
  offeredTo?: string;
  offerExpiresAt?: number;
  directOffers: number;
  /** People who declined, timed out or missed a deadline on this refill: never asked again for it. */
  excluded: string[];
  commit?: { by: string; at: number; deadline: number; capMinor: number; reminded: boolean };
  purchase?: {
    by: string;
    at: number;
    amountMinor: number;
    currency: Currency;
    items: string[];
    receipt: string;
    overBudget: boolean;
  };
  claim?: {
    id?: string;
    attempts: number;
    lastError?: string;
    submittedAt?: number;
    reminded: boolean;
  };
  reimbursement?: { at: number; amountMinor: number; currency: Currency };
  history: HistoryEntry[];
}
