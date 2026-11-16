import { convert, monthKey, type Rates } from "./money";
import type { BudgetLedger } from "./ledger";
import type { Currency, OfficeConfig, OfficeId, Refill, Volunteer } from "./types";

export interface OfficeReport {
  office: OfficeId;
  name: string;
  currency: Currency;
  budgetMinor: number;
  spentMinor: number;
  reservedMinor: number;
  remainingMinor: number;
  utilisation: number;
  refills: number;
  avgPurchaseMinor: number;
  /** Hours from "it's empty" to receipt, averaged. */
  avgHoursToRefill: number | null;
  /** Days from receipt to HR paying, averaged. */
  avgDaysToReimburse: number | null;
  /** Share of this month's refills done by the single most active volunteer (fairness check). */
  topContributorShare: number;
  /** In reporting currency, for the combined line. */
  spentReportingMinor: number;
  budgetReportingMinor: number;
}

export interface MonthlyReport {
  month: string;
  reporting: Currency;
  rates: Rates;
  offices: OfficeReport[];
  total: { spentMinor: number; budgetMinor: number; reservedMinor: number; refills: number; utilisation: number };
  items: { item: string; bought: number; ranOut: number }[];
  contributors: { id: string; name: string; office: OfficeId; refills: number; spentMinor: number; currency: Currency }[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * One report across both offices. Each office is summed in ITS OWN currency first; only the final management
 * line is converted, with the rate snapshot stored on the report, so a finished month never changes.
 */
export function monthlyReport(args: {
  month: string;
  refills: Refill[];
  ledger: BudgetLedger;
  offices: Record<OfficeId, OfficeConfig>;
  volunteers: Volunteer[];
  rates: Rates;
}): MonthlyReport {
  const { month, refills, ledger, offices, volunteers, rates } = args;
  const entries = ledger.all().filter((e) => e.month === month);
  const byId = new Map(refills.map((r) => [r.id, r]));
  const itemMap = new Map<string, { bought: number; ranOut: number }>();
  const bump = (item: string, k: "bought" | "ranOut") => {
    const x = itemMap.get(item) ?? { bought: 0, ranOut: 0 };
    x[k]++;
    itemMap.set(item, x);
  };
  const contrib = new Map<string, { refills: number; spentMinor: number }>();

  const offReports: OfficeReport[] = (Object.keys(offices) as OfficeId[]).map((id) => {
    const cfg = offices[id];
    const snap = ledger.snapshot(id, month);
    const spentEntries = entries.filter((e) => e.office === id && e.kind === "spent");
    const rs = spentEntries.map((e) => byId.get(e.refillId)).filter((r): r is Refill => !!r && !!r.purchase);
    const perVol = new Map<string, number>();
    for (const r of rs) {
      perVol.set(r.purchase!.by, (perVol.get(r.purchase!.by) ?? 0) + 1);
      const c = contrib.get(r.purchase!.by) ?? { refills: 0, spentMinor: 0 };
      c.refills++;
      c.spentMinor += r.purchase!.amountMinor;
      contrib.set(r.purchase!.by, c);
      r.purchase!.items.forEach((i) => bump(i, "bought"));
    }
    refills.filter((r) => r.office === id && monthKey(r.reportedAt) === month).forEach((r) => r.itemsLow.forEach((i) => bump(i, "ranOut")));
    const top = Math.max(0, ...perVol.values());
    return {
      office: id,
      name: cfg.name,
      currency: cfg.currency,
      budgetMinor: snap.budgetMinor,
      spentMinor: snap.spentMinor,
      reservedMinor: snap.reservedMinor,
      remainingMinor: snap.availableMinor,
      utilisation: snap.utilisation,
      refills: rs.length,
      avgPurchaseMinor: rs.length ? Math.round(snap.spentMinor / rs.length) : 0,
      avgHoursToRefill: avg(rs.map((r) => (r.purchase!.at - r.reportedAt) / 3_600_000)),
      avgDaysToReimburse: avg(rs.filter((r) => r.reimbursement).map((r) => (r.reimbursement!.at - r.purchase!.at) / 86_400_000)),
      topContributorShare: rs.length ? top / rs.length : 0,
      spentReportingMinor: convert(snap.spentMinor, cfg.currency, rates.reporting, rates),
      budgetReportingMinor: convert(snap.budgetMinor, cfg.currency, rates.reporting, rates),
    };
  });

  const spent = offReports.reduce((a, o) => a + o.spentReportingMinor, 0);
  const budget = offReports.reduce((a, o) => a + o.budgetReportingMinor, 0);
  const reserved = offReports.reduce((a, o) => a + convert(o.reservedMinor, o.currency, rates.reporting, rates), 0);
  return {
    month,
    reporting: rates.reporting,
    rates,
    offices: offReports,
    total: {
      spentMinor: spent,
      budgetMinor: budget,
      reservedMinor: reserved,
      refills: offReports.reduce((a, o) => a + o.refills, 0),
      utilisation: budget ? (spent + reserved) / budget : 0,
    },
    items: [...itemMap.entries()]
      .map(([item, v]) => ({ item, ...v }))
      .sort((a, b) => b.bought + b.ranOut - (a.bought + a.ranOut)),
    contributors: [...contrib.entries()]
      .map(([id, c]) => {
        const v = volunteers.find((x) => x.id === id)!;
        return { id, name: v.name, office: v.homeOffice, refills: c.refills, spentMinor: c.spentMinor, currency: offices[v.homeOffice].currency };
      })
      .sort((a, b) => b.refills - a.refills),
  };
}
