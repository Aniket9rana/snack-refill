import type { OfficeId, Presence, Volunteer } from "./types";

/** Where is this person on the day containing `at`? Visits and holidays beat the weekly pattern. */
export function presenceOf(v: Volunteer, at: number): Presence {
  const day = new Date(at).getUTCDay();
  if (v.holidays.some((h) => at >= h.from && at <= h.to)) return { kind: "holiday" };
  if (day === 0 || day === 6) return { kind: "off" };
  const visit = v.visits.find((x) => at >= x.from && at <= x.to);
  if (visit) return { kind: "office", office: visit.office, visiting: visit.office !== v.homeOffice };
  if (v.officeDays.includes(day)) return { kind: "office", office: v.homeOffice, visiting: false };
  return { kind: "remote", home: v.homeOffice };
}

/** Tier 1 = physically in that office today (can refill and stock the box now). Tier 2 = works remotely from
 *  that office's team today (can buy now, stock the box next office day). Anything else = unavailable. */
export function availabilityTier(v: Volunteer, office: OfficeId, at: number): 1 | 2 | null {
  const p = presenceOf(v, at);
  if (p.kind === "office" && p.office === office) return 1;
  if (p.kind === "remote" && p.home === office) return 2;
  return null;
}
