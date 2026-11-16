import { HrUnavailableError } from "./errors";
import { convert, type Rates } from "./money";
import type { ChatMessage, ChatPort, ClaimInput, ClaimStatus, Clock, HrPort } from "./ports";
import type { Currency } from "./types";

export class FakeClock implements Clock {
  constructor(private t: number) {}
  now() {
    return this.t;
  }
  set(t: number) {
    this.t = t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

/** Stands in for the company chat tool: records every message and lets the UI subscribe. */
export class FakeChat implements ChatPort {
  readonly sent: (ChatMessage & { at: number; id: number })[] = [];
  private listeners = new Set<(m: ChatMessage & { at: number; id: number }) => void>();
  private seq = 0;
  constructor(private clock: Clock) {}
  send(message: ChatMessage) {
    const m = { ...message, at: this.clock.now(), id: ++this.seq };
    this.sent.push(m);
    this.listeners.forEach((l) => l(m));
  }
  subscribe(fn: (m: ChatMessage & { at: number; id: number }) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  to(user: string) {
    return this.sent.filter((m) => "user" in m.target && m.target.user === user);
  }
  ofKind(kind: ChatMessage["kind"]) {
    return this.sent.filter((m) => m.kind === kind);
  }
}

interface FakeClaim {
  id: string;
  input: ClaimInput;
  createdAt: number;
  delayMs: number;
  forced?: "approve" | "reject";
}

const DAY = 86_400_000;

/**
 * Stands in for the other company's HR system. Behaviours that matter for the design:
 * idempotent create (same key = same claim), outages, approval after 1–10 days, rejection, and payout in the
 * employee's PAYROLL currency using HR's own rate (which differs slightly from ours).
 */
export class FakeHr implements HrPort {
  readonly claims = new Map<string, FakeClaim>();
  private byKey = new Map<string, string>();
  /** Every createClaim call, including failed and repeated ones. */
  calls = 0;
  down = false;
  failNext = 0;
  private seq = 0;

  constructor(
    private clock: Clock,
    private payrollOf: (employeeId: string) => Currency,
    private hrRates: Rates = { reporting: "NOK", perUnit: { NOK: 1, INR: 0.121 }, asOf: "hr" },
  ) {}

  async createClaim(input: ClaimInput) {
    this.calls++;
    await Promise.resolve();
    if (this.down || this.failNext > 0) {
      if (this.failNext > 0) this.failNext--;
      throw new HrUnavailableError();
    }
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return { claimId: existing };
    this.seq++;
    const id = `CLM-${String(this.seq).padStart(4, "0")}`;
    // Deterministic 1..10 day approval time.
    const delayMs = (((this.seq * 7) % 10) + 1) * DAY;
    this.claims.set(id, { id, input, createdAt: this.clock.now(), delayMs });
    this.byKey.set(input.idempotencyKey, id);
    return { claimId: id };
  }

  async getClaim(claimId: string): Promise<ClaimStatus> {
    await Promise.resolve();
    const c = this.claims.get(claimId);
    if (!c) throw new Error("unknown claim");
    const due = c.createdAt + c.delayMs;
    if (c.forced === "reject") return { status: "rejected", reason: "Receipt unreadable", at: this.clock.now() };
    if (c.forced === "approve" || this.clock.now() >= due) {
      const payoutCurrency = this.payrollOf(c.input.employeeId);
      return {
        status: "approved",
        payoutCurrency,
        payoutMinor: convert(c.input.amountMinor, c.input.currency, payoutCurrency, this.hrRates),
        at: c.forced ? this.clock.now() : due,
      };
    }
    return { status: "pending" };
  }

  approve(id: string) {
    const c = this.claims.get(id);
    if (c) c.forced = "approve";
  }
  reject(id: string) {
    const c = this.claims.get(id);
    if (c) c.forced = "reject";
  }
}
