import { type Volunteer, type OfficeId } from "@/domain";

const D = 86_400_000;
const utc = (m: number, d: number) => Date.UTC(2026, m - 1, d);

const OSLO = ["Ingrid", "Lars", "Sofie", "Henrik", "Nora", "Magnus", "Emilie", "Jonas", "Astrid", "Mats", "Thea", "Sander", "Maja", "Kristian", "Live"];
const BLR = [
  "Aarav", "Ananya", "Vikram", "Priya", "Rohan", "Kavya", "Arjun", "Meera", "Karthik", "Divya",
  "Rahul", "Sneha", "Nikhil", "Pooja", "Siddharth", "Lakshmi", "Varun", "Ishita", "Manoj", "Deepa",
];
const PATTERNS = [[1, 2, 3], [2, 3, 4], [1, 3, 5], [1, 2, 3, 4, 5], [2, 4], [3, 4, 5], [1, 2], [4, 5]];

const make = (office: OfficeId, names: string[], prefix: string): Volunteer[] =>
  names.map((name, i) => ({
    id: `${prefix}-${String(i + 1).padStart(2, "0")}`,
    name,
    homeOffice: office,
    payrollCurrency: office === "OSL" ? "NOK" : "INR",
    officeDays: PATTERNS[(i * 3 + (office === "OSL" ? 0 : 1)) % PATTERNS.length],
    holidays: [],
    visits: [],
  }));

/** About 15 volunteers in Oslo and 20 in Bengaluru, with a few holidays and cross-office visits around "now". */
export function buildRoster(): Volunteer[] {
  const v = [...make("OSL", OSLO, "OSL"), ...make("BLR", BLR, "BLR")];
  const by = (id: string) => v.find((x) => x.id === id)!;
  by("OSL-02").holidays.push({ from: utc(11, 12), to: utc(11, 27) + D });
  by("OSL-06").holidays.push({ from: utc(11, 16), to: utc(11, 20) + D });
  by("OSL-11").holidays.push({ from: utc(10, 12), to: utc(10, 23) + D });
  by("BLR-04").holidays.push({ from: utc(11, 14), to: utc(11, 29) + D });
  by("BLR-09").holidays.push({ from: utc(11, 16), to: utc(11, 18) + D });
  by("BLR-15").holidays.push({ from: utc(10, 19), to: utc(10, 30) + D });
  // Oslo colleagues visiting Bengaluru, and one Bengaluru colleague visiting Oslo.
  by("OSL-03").visits.push({ office: "BLR", from: utc(11, 9), to: utc(11, 27) + D });
  by("OSL-08").visits.push({ office: "BLR", from: utc(10, 26), to: utc(11, 6) + D });
  by("BLR-12").visits.push({ office: "OSL", from: utc(11, 16), to: utc(11, 28) + D });
  return v;
}
