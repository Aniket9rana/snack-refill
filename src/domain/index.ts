import { BudgetLedger } from "./ledger";
import { DEFAULT_POLICY, DEFAULT_RATES, OFFICES } from "./config";
import { FakeChat, FakeClock, FakeHr } from "./fakes";
import { InMemoryRefillRepo } from "./repo";
import { RefillService } from "./service";
import type { Policy, Volunteer } from "./types";
import type { Rates } from "./money";

export * from "./types";
export * from "./errors";
export * from "./money";
export * from "./config";
export * from "./ports";
export * from "./presence";
export * from "./picker";
export * from "./ledger";
export * from "./report";
export * from "./fakes";
export * from "./repo";
export * from "./service";

/** Wire the service to in-memory stand-ins for the chat tool and the HR system. */
export function createWorld(opts: { start: number; volunteers: Volunteer[]; policy?: Partial<Policy>; rates?: Rates }) {
  const clock = new FakeClock(opts.start);
  const chat = new FakeChat(clock);
  const hr = new FakeHr(clock, (id) => opts.volunteers.find((v) => v.id === id)!.payrollCurrency);
  const repo = new InMemoryRefillRepo();
  const ledger = new BudgetLedger(OFFICES);
  let n = 0;
  const service = new RefillService({
    repo,
    chat,
    hr,
    clock,
    ledger,
    volunteers: opts.volunteers,
    offices: OFFICES,
    policy: { ...DEFAULT_POLICY, ...opts.policy },
    rates: opts.rates ?? DEFAULT_RATES,
    newId: () => `RF-${String(++n).padStart(4, "0")}`,
  });
  return { clock, chat, hr, repo, ledger, service, volunteers: opts.volunteers, rates: opts.rates ?? DEFAULT_RATES };
}
