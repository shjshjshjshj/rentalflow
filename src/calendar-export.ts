import type { Booking } from "./model.ts";
export const eligibleCalendar = (booking: Booking) => booking.rentalStatus !== "cancelled" && booking.approvalStatus !== "rejected";

export function calendarEvent(booking: Booking, productName: string) {
  const start = Date.parse(booking.startAt), end = Date.parse(booking.endAt);
  if (!eligibleCalendar(booking) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("errors.calendarEvent");
  return { title: `Rental Flow · ${productName} · ${booking.referenceCode}`, start, end };
}
const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const stamp = (value: number) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
function fold(line: string) {
  const rows: string[] = []; let current = "", bytes = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (bytes + length > 75) { rows.push(current); current = " "; bytes = 1; }
    current += char; bytes += length;
  }
  rows.push(current); return rows.join("\r\n");
}
export function calendarFile(booking: Booking, productName: string, now = Date.now()): string {
  const event = calendarEvent(booking, productName);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rental Flow//Calendar//EN", "BEGIN:VEVENT", `UID:${escapeText(booking.id)}@rentalflow.local`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`, `SUMMARY:${escapeText(event.title)}`, "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}
