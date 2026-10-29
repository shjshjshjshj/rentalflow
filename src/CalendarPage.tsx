import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, Package, Plus } from "lucide-react";
import type { Booking, RentalData } from "./model";
import { calendarBookings } from "./domain";
import { formatDateTime, getLocale, t, tp } from "./i18n";
import { addDays, dayKey } from "./region";

const formatDay = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(getLocale(), { ...options, timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
const formatMonth = (day: string) => formatDay(day, { year: "numeric", month: "long" });
const formatFullDate = (day: string) => formatDay(day, { dateStyle: "full" });
const formatWeekdayShort = (day: string) => formatDay(day, { weekday: "short" });
const formatDate = formatFullDate;

export default function CalendarPage({ data, onBooking, onAdd }: { data: RentalData; onBooking: (booking: Booking) => void; onAdd: () => void }) {
  const today = dayKey(new Date(), data.timeZone);
  const [selected, setSelected] = useState(today);
  const [start, setStart] = useState(() => addDays(today, -45));
  const strip = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const scrollAdjustment = useRef<number | null>(null);
  const dates = Array.from({ length: 91 }, (_, index) => addDays(start, index));
  const bookings = calendarBookings(data.bookings, selected, today);
  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    const button = element?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (scrollAdjustment.current !== null) element.scrollLeft += scrollAdjustment.current;
    else if (button) element.scrollLeft = button.offsetLeft - element.clientWidth / 2 + button.clientWidth / 2;
    scrollAdjustment.current = null;
  }, [start]);
  useLayoutEffect(() => {
    list.current?.scrollTo(0, 0);
  }, [selected]);
  const extendDates = () => {
    const element = strip.current;
    if (!element || scrollAdjustment.current !== null) return;
    const buttons = element.querySelectorAll('button');
    const step = buttons[1].offsetLeft - buttons[0].offsetLeft;
    const direction = element.scrollLeft < step * 7 ? -1 : element.scrollWidth - element.clientWidth - element.scrollLeft < step * 7 ? 1 : 0;
    if (!direction) return;
    // Keep 91 dates mounted and preserve the visible dates when recycling either end.
    scrollAdjustment.current = -direction * 30 * step;
    setStart(value => addDays(value, direction * 30));
  };
  const tone = (booking: Booking) => {
    if (booking.rentalStatus === "returned") return { color: "complete", label: t("calendar.toneReturned") };
    if (["checked_out", "returning"].includes(booking.rentalStatus) && +new Date(booking.endAt) < Date.now()) return { color: "red", label: t("calendar.toneOverdue") };
    if (booking.approvalStatus === "needs_supplement") return { color: "red", label: t("booking.approval.needs_supplement") };
    if (booking.rentalStatus === "returning" || data.issues.some(issue => issue.bookingId === booking.id && issue.status === "open")) return { color: "red", label: t("calendar.toneCheck") };
    if (booking.approvalStatus === "pending") return { color: "blue", label: t("booking.approval.pending") };
    return booking.rentalStatus === "checked_out" ? { color: "green", label: t("booking.rental.checked_out") } : { color: "blue", label: t("booking.rental.reserved") };
  };

  return <div className="calendar-page">
    <section className="page-intro compact"><div><span>{t("calendar.subtitle")}</span><h1>{formatMonth(selected)}</h1></div><button className="primary-command" onClick={onAdd}><Plus size={18} />{t("calendar.booking")}</button></section>
    <section className="calendar-picker" aria-label={t("calendar.pickerAria")}>
      <button className="outline-command calendar-today" onClick={() => { setSelected(today); scrollAdjustment.current = null; setStart(addDays(today, -45)); }}>{t("calendar.today")}</button>
      <div ref={strip} className="calendar-date-strip" aria-label={t("calendar.dateListAria")} onScroll={extendDates}>{dates.map(date => {
        const count = calendarBookings(data.bookings, date, today).length;
        return <button key={date} data-date={date} aria-pressed={date === selected} aria-current={date === today ? "date" : undefined} aria-label={t("calendar.dateAria", { date: formatFullDate(date), count })} onClick={() => setSelected(date)}><small>{formatWeekdayShort(date)}</small><strong>{date.slice(-2) === "01" ? `${Number(date.slice(5, 7))}/1` : Number(date.slice(-2))}</strong><small className="calendar-day-count">{count ? tp("calendar.dayCount", count) : "–"}</small></button>;
      })}</div>
    </section>
    <section className="calendar-day-agenda" aria-labelledby="calendar-day-title">
      <div className="calendar-day-heading"><h2 id="calendar-day-title">{formatDate(selected)}</h2><span role="status">{tp("calendar.contracts", bookings.length)}</span></div>
      <div ref={list} className="calendar-contract-list">{bookings.length ? bookings.map(booking => {
        const product = data.products.find(item => item.id === booking.productId);
        const status = tone(booking);
        return <button key={booking.id} data-booking-id={booking.id} className={`calendar-contract ${status.color}`} onClick={() => onBooking(booking)}>
          <span className="calendar-contract-icon"><Package size={20} /></span>
          <span className="calendar-contract-content"><span className="calendar-contract-title"><strong>{product?.name || t("common.unknownItem")}</strong><ChevronRight size={18} /></span><small>{product?.identifier} · {booking.customerName}</small>
            <span className="calendar-contract-times"><span><ArrowUpRight size={16} /><span>{t("schedule.pickup")} <time dateTime={booking.startAt}>{formatDateTime(booking.startAt)}</time></span></span><span><ArrowDownLeft size={16} /><span>{t("schedule.return")} <time dateTime={booking.endAt}>{formatDateTime(booking.endAt)}</time></span></span></span>
            <span className="calendar-contract-meta"><small>{booking.referenceCode}</small><span>{status.label}</span></span>
          </span>
        </button>;
      }) : <div className="calendar-empty"><CalendarDays size={28} /><strong>{t("calendar.empty")}</strong><p>{t("calendar.emptyHint")}</p></div>}</div>
    </section>
  </div>;
}
