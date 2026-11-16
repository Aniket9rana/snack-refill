import type { Currency } from "./types";

/** Units of the reporting currency per 1 unit of each currency. One snapshot per month is stored with the report. */
export interface Rates {
  reporting: Currency;
  perUnit: Record<Currency, number>;
  asOf: string; // e.g. "2026-11"
}

/** Convert minor units between currencies. Both currencies have 100 minor units, so the ratio carries over. */
export function convert(minor: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return minor;
  return Math.round((minor * rates.perUnit[from]) / rates.perUnit[to]);
}

const groupIndian = (n: string) => {
  // 1,23,456 style grouping for INR
  if (n.length <= 3) return n;
  const last3 = n.slice(-3);
  const rest = n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
};

const groupSpace = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** "₹15,000" / "6 000 kr". Shows paise/øre only when there are any. */
export function formatMoney(minor: number, currency: Currency): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const w = currency === "INR" ? groupIndian(String(whole)) : groupSpace(String(whole));
  const f = frac ? `.${String(frac).padStart(2, "0")}` : "";
  const body = currency === "INR" ? `₹${w}${f}` : `${w}${f} kr`;
  return neg ? `−${body}` : body;
}

export const toMinor = (major: number) => Math.round(major * 100);

/** "2026-11" in UTC. Budgets reset on this boundary. */
export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
