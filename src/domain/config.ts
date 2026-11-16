import type { OfficeConfig, OfficeId, Policy, Currency } from "./types";
import type { Rates } from "./money";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const OFFICES: Record<OfficeId, OfficeConfig> = {
  OSL: {
    id: "OSL",
    name: "Oslo",
    currency: "NOK",
    monthlyBudgetMinor: 600_000, // 6 000 NOK
    typicalMinMinor: 30_000, // 300 NOK
    typicalMaxMinor: 120_000, // 1 200 NOK
  },
  BLR: {
    id: "BLR",
    name: "Bengaluru",
    currency: "INR",
    monthlyBudgetMinor: 1_500_000, // 15 000 INR
    typicalMinMinor: 50_000, // 500 INR
    typicalMaxMinor: 300_000, // 3 000 INR
  },
};

export const DEFAULT_POLICY: Policy = {
  offerTtlMs: 2 * HOUR,
  commitWindowMs: DAY,
  reminderAt: 0.5,
  maxDirectOffers: 3,
  maxOutstandingClaims: 2,
  maxOwedReportingMinor: 250_000, // 2 500 NOK
  fairnessWindowMs: 60 * DAY,
  claimReminderMs: 7 * DAY,
  maxClaimAttempts: 50,
};

/** Management reports in NOK. One snapshot per month; the rate used is stored with the report so old months never move. */
export const DEFAULT_RATES: Rates = {
  reporting: "NOK" as Currency,
  perUnit: { NOK: 1, INR: 0.1235 },
  asOf: "2026-11",
};

export const SNACK_CATALOG = [
  "Nuts & trail mix",
  "Dark chocolate",
  "Granola bars",
  "Fruit & dried fruit",
  "Chips",
  "Biscuits",
  "Crackers",
  "Sparkling water",
  "Tea & coffee",
  "Namkeen",
] as const;
