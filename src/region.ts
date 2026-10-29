export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || /^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export function deviceTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return validTimeZone(zone) ? zone : "Asia/Seoul";
}
export function canonicalTimeZone(value: string): string {
  if (!validTimeZone(value)) throw new Error("errors.timeZone");
  return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
}
let timeZone = deviceTimeZone();
export const getTimeZone = () => timeZone;
export function setTimeZone(value: string) {
  if (!validTimeZone(value)) throw new Error("errors.timeZone");
  timeZone = canonicalTimeZone(value);
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localInput(value: string | Date, zone = getTimeZone()): string {
  let formatter = formatters.get(zone);
  if (!formatter) { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); formatters.set(zone, formatter); }
  const parts = formatter.formatToParts(new Date(value));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export const dayKey = (value: string | Date = new Date(), zone = getTimeZone()) => localInput(value, zone).slice(0, 10);
export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function addDays(day: string, count: number): string {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
/** Keep stored instants unchanged. Reject missing or repeated wall times instead of guessing a DST offset. */
export function toInstant(value: string, zone = getTimeZone()): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !validDay(value.slice(0, 10))) throw new Error("errors.localTime");
  const wall = Date.parse(value + ":00Z");
  if (!Number.isFinite(wall)) throw new Error("errors.localTime");
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = wall + hours * 3600000;
    offsets.add(Date.parse(localInput(new Date(sample), zone) + ":00Z") - sample);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(at => localInput(new Date(at), zone) === value);
  if (candidates.length !== 1) throw new Error(candidates.length ? "errors.ambiguousTime" : "errors.localTime");
  return new Date(candidates[0]).toISOString();
}
