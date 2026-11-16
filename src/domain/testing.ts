import { createWorld } from "./index";
import type { OfficeId, Policy, Volunteer } from "./types";

export const H = 3_600_000;
export const D = 24 * H;
/** Monday 2026-11-16 09:00 UTC. */
export const MONDAY = Date.UTC(2026, 10, 16, 9, 0, 0);

export function vol(id: string, home: OfficeId, extra: Partial<Volunteer> = {}): Volunteer {
  return {
    id,
    name: id,
    homeOffice: home,
    payrollCurrency: home === "OSL" ? "NOK" : "INR",
    officeDays: [1, 2, 3, 4, 5],
    holidays: [],
    visits: [],
    ...extra,
  };
}

export const TEAM = (): Volunteer[] => [
  vol("anna", "OSL"),
  vol("bjorn", "OSL"),
  vol("camilla", "OSL"),
  vol("dev", "BLR"),
  vol("esha", "BLR"),
  vol("farhan", "BLR"),
];

export function world(volunteers = TEAM(), policy?: Partial<Policy>) {
  return createWorld({ start: MONDAY, volunteers, policy });
}
