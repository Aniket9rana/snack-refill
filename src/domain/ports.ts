import type { Currency, OfficeId, Refill } from "./types";

export interface Clock {
  now(): number;
}

/** Everything the service tells people. The real adapter posts to the company chat; the fake records messages. */
export type ChatTarget = { user: string } | { channel: OfficeId } | { leads: OfficeId };
export type ChatAction = "accept" | "decline" | "complete" | "take";
export interface ChatMessage {
  target: ChatTarget;
  kind:
    | "offer"
    | "offer_reassigned"
    | "reminder"
    | "committed"
    | "commit_released"
    | "escalation"
    | "budget_hold"
    | "budget_warning"
    | "purchase_logged"
    | "claim_status"
    | "claim_nudge"
    | "reimbursed";
  refillId: string;
  office: OfficeId;
  text: string;
  actions?: ChatAction[];
}
export interface ChatPort {
  send(message: ChatMessage): void | Promise<void>;
}

export interface ClaimInput {
  /** Same key = same claim: retrying after a timeout can never create a duplicate. */
  idempotencyKey: string;
  employeeId: string;
  amountMinor: number;
  currency: Currency;
  description: string;
  receipt: string;
}
export type ClaimStatus =
  | { status: "pending" }
  | { status: "approved"; payoutMinor: number; payoutCurrency: Currency; at: number }
  | { status: "rejected"; reason: string; at: number };

export interface HrPort {
  createClaim(input: ClaimInput): Promise<{ claimId: string }>;
  getClaim(claimId: string): Promise<ClaimStatus>;
}

export interface RefillRepo {
  get(id: string): Promise<Refill | undefined>;
  list(): Promise<Refill[]>;
  insert(refill: Refill): Promise<void>;
  /** Compare-and-set. Stores `next` only if the stored version equals `expectedVersion`, else throws VersionConflict. */
  save(next: Refill, expectedVersion: number): Promise<void>;
}
