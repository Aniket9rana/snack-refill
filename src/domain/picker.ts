import { availabilityTier, presenceOf } from "./presence";
import { convert, formatMoney, type Rates } from "./money";
import type { OfficeId, Policy, Refill, Volunteer } from "./types";

export interface VolunteerStats {
  /** Refills this person bought in the fairness window. */
  recentRefills: number;
  lastRefillAt?: number;
  /** Claims submitted (or waiting to be) that HR has not paid yet. */
  outstandingClaims: number;
  /** Their unpaid money, in the reporting currency. */
  owedReportingMinor: number;
  /** Already committed to another refill, or holding an unanswered offer. */
  busy: boolean;
}

export function statsFor(v: Volunteer, refills: Refill[], at: number, policy: Policy, rates: Rates): VolunteerStats {
  let recent = 0;
  let last: number | undefined;
  let outstanding = 0;
  let owed = 0;
  let busy = false;
  for (const r of refills) {
    if (r.purchase?.by === v.id) {
      if (r.purchase.at >= at - policy.fairnessWindowMs) recent++;
      if (last === undefined || r.purchase.at > last) last = r.purchase.at;
      if (r.state === "PURCHASED" || r.state === "CLAIMED") {
        outstanding++;
        owed += convert(r.purchase.amountMinor, r.purchase.currency, rates.reporting, rates);
      }
    }
    if (r.state === "COMMITTED" && r.commit?.by === v.id) busy = true;
    if (r.state === "OFFERED" && r.offeredTo === v.id) busy = true;
  }
  return { recentRefills: recent, lastRefillAt: last, outstandingClaims: outstanding, owedReportingMinor: owed, busy };
}

export interface Candidate {
  volunteer: Volunteer;
  /** 1 = in the office today, 2 = works remotely from that office's team today. */
  tier: 1 | 2;
  stats: VolunteerStats;
  reasons: string[];
}

export interface RankInput {
  office: OfficeId;
  volunteers: Volunteer[];
  refills: Refill[];
  at: number;
  policy: Policy;
  rates: Rates;
  exclude?: string[];
  officeName: (id: OfficeId) => string;
}

/**
 * Who should buy? Pure and deterministic, so it is easy to test and to explain to the person who was picked.
 *
 * Hard filters: available today (in office, or remote from that office's team; holidays and weekends out),
 * not already busy, not already declined/timed out on THIS refill, and not owed too much money (so the same
 * few people do not keep fronting cash while waiting for HR).
 * Order: in-office before remote, then fewest recent refills, then the longest since their last one, then id.
 */
export function rankCandidates(input: RankInput): Candidate[] {
  const { office, volunteers, refills, at, policy, rates, exclude = [], officeName } = input;
  const out: Candidate[] = [];
  for (const v of volunteers) {
    if (exclude.includes(v.id)) continue;
    const tier = availabilityTier(v, office, at);
    if (!tier) continue;
    const stats = statsFor(v, refills, at, policy, rates);
    if (stats.busy) continue;
    if (stats.outstandingClaims >= policy.maxOutstandingClaims) continue;
    if (stats.owedReportingMinor >= policy.maxOwedReportingMinor) continue;
    const p = presenceOf(v, at);
    const where =
      tier === 1
        ? p.kind === "office" && p.visiting
          ? `Visiting ${officeName(office)} this week`
          : `In the ${officeName(office)} office today`
        : "Working remotely today: can buy now, stock the box next office day";
    out.push({
      volunteer: v,
      tier,
      stats,
      reasons: [
        where,
        stats.recentRefills === 0
          ? "No refills in the last 60 days"
          : `${stats.recentRefills} refill${stats.recentRefills > 1 ? "s" : ""} in the last 60 days`,
        stats.outstandingClaims === 0
          ? "Nothing waiting on HR"
          : `${formatMoney(stats.owedReportingMinor, rates.reporting)} still owed by HR`,
      ],
    });
  }
  out.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.stats.recentRefills - b.stats.recentRefills ||
      (a.stats.lastRefillAt ?? -Infinity) - (b.stats.lastRefillAt ?? -Infinity) ||
      a.volunteer.id.localeCompare(b.volunteer.id),
  );
  return out;
}
