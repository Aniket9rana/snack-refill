const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");

export function fmtDate(ms: number) {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function fmtTime(ms: number) {
  const d = new Date(ms);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
export function fmtMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
/** "2h 10m", "3d 4h", "just now". */
export function fmtSpan(ms: number) {
  const s = Math.max(0, Math.round(ms / 60000));
  if (s < 1) return "just now";
  const d = Math.floor(s / 1440);
  const h = Math.floor((s % 1440) / 60);
  const m = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
export const initials = (name: string) => name.slice(0, 2).toUpperCase();
