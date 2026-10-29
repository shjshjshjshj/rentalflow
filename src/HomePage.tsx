import { useEffect, useState } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronRight, Clock3, Info, Plus } from "lucide-react";
import { todaySchedule } from "./domain";
import type { Booking, Issue, Product, RentalData } from "./model";
import { formatDate, formatTime, scheduleLabel, t } from "./i18n";
import OperationsOverview from "./OperationsOverview";
import { homeAttention, operations } from "./operations";

type Props = {
  data: RentalData;
  userName: string;
  onProduct: (product: Product) => void;
  onBooking: () => void;
  onOpenBooking: (booking: Booking) => void;
  onOpenIssue: (issue: Issue) => void;
  onWork: () => void;
  onCalendar: () => void;
};

export default function HomePage({ data, userName, onProduct, onBooking, onOpenBooking, onOpenIssue, onWork, onCalendar }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const schedule = todaySchedule(data.bookings, now, data.timeZone);
  const attentionStates: Record<string, string> = {
    pending_approval: t("booking.approval.pending"), needs_supplement: t("booking.approval.needs_supplement"),
    approval_overdue: t("home.overdueApproval"), supplement_overdue: t("home.overdueSupplement"),
    pickup_overdue: t("home.overduePickup"), return_overdue: t("calendar.toneOverdue"),
  };
  const productName = (id: string) => data.products.find(item => item.id === id)?.name || t("common.unknownItem");
  const attention = homeAttention(data, now).map(item => item.kind === "issue"
    ? { key: `issue:${item.issue.id}`, title: item.issue.type, sub: productName(item.issue.productId), badge: t("home.issueBadge"), tone: "attention", open: () => onOpenIssue(item.issue) }
    : { key: `booking:${item.booking.id}`, title: productName(item.booking.productId), sub: `${item.booking.customerName} · ${item.booking.referenceCode}`, badge: attentionStates[item.state], tone: item.state.endsWith("_overdue") ? "overdue" : "attention", open: () => onOpenBooking(item.booking) });
  const stats = [
    { label: t("home.pickupToday"), count: schedule.filter(item => item.label === "pickup").length, icon: ArrowUpRight, tone: "pickup" },
    { label: t("home.returnToday"), count: schedule.filter(item => item.label === "return").length, icon: ArrowDownLeft, tone: "return" },
    { label: t("home.onRent"), count: operations(data, now).rented.length, icon: Clock3, tone: "ongoing" },
    { label: t("home.needsAttention"), count: attention.length, icon: AlertCircle, tone: attention.length > 0 ? "attention" : "neutral" },
  ];
  return <div className="home-page">
    <header className="home-heading">
      <div><p className="home-date">{formatDate(now)}<span className="home-user">{userName}</span></p><h1>{t("home.managementTitle")}</h1></div>
      <button className="home-create" onClick={onBooking}><Plus size={19} aria-hidden="true" />{t("home.newBooking")}</button>
    </header>

    <section className="current-summary" aria-label={t("home.currentSummary")}>
      <h2 className="home-visually-hidden">{t("home.currentSummary")}</h2>
      <dl>{stats.map(({ label, count, icon: Icon, tone }) => <div key={label} className={`home-metric home-metric-${tone}`}>
        <dt><Icon size={16} aria-hidden="true" /><span>{label}</span></dt><dd>{count}</dd>
      </div>)}</dl>
      <details className="operations-help home-summary-help">
        <summary><Info size={16} aria-hidden="true" />{t("home.countingRules")}</summary>
        <p>{t("home.summaryHint")}</p>
      </details>
    </section>

    <div className="home-content">
      <section className="home-agenda" aria-labelledby="home-agenda-title">
        <div className="home-section-heading"><h2 id="home-agenda-title">{t("home.agendaTitle")}</h2><button className="home-text-action" onClick={onCalendar}>{t("nav.calendar")}<ChevronRight size={17} aria-hidden="true" /></button></div>
        {schedule.length ? <ol className="home-agenda-list">{schedule.map(({ booking, at, label }) => {
          const Icon = label === "pickup" ? ArrowUpRight : ArrowDownLeft;
          return <li key={booking.id + label} className={`home-agenda-item ${label}`}><button onClick={() => onOpenBooking(booking)}>
            <time dateTime={at}>{formatTime(at)}</time>
            <span className={`home-event-marker ${label}`}><Icon size={18} aria-hidden="true" /></span>
            <span className="home-event-copy"><span className="home-event-kind">{scheduleLabel(label)}</span><strong>{productName(booking.productId)}</strong><small>{booking.customerName} · {booking.referenceCode}</small></span>
            <ChevronRight className="home-row-chevron" size={17} aria-hidden="true" />
          </button></li>;
        })}</ol> : <div className="home-empty"><CalendarDays size={30} strokeWidth={1.5} aria-hidden="true" /><p>{t("home.noToday")}</p></div>}
      </section>

      <aside className="home-supporting">
        <section className="home-attention" aria-labelledby="home-attention-title">
          <div className="home-section-heading"><h2 id="home-attention-title">{t("home.attentionTitle")}{attention.length > 0 && <span className="home-attention-count">{attention.length}</span>}</h2><button className="home-text-action" onClick={onWork}>{t("home.viewAll")}<ChevronRight size={17} aria-hidden="true" /></button></div>
          {attention.length ? <ul className="home-attention-list">{attention.slice(0, 3).map(item => <li key={item.key} className={`home-attention-item ${item.tone}`}><button onClick={item.open}>
            <AlertCircle size={18} className="home-alert-icon" aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.sub}</small><em>{item.badge}</em></span><ChevronRight className="home-row-chevron" size={17} aria-hidden="true" />
          </button></li>)}</ul> : <p className="home-all-clear"><Check size={19} aria-hidden="true" />{t("home.noAttention")}</p>}
        </section>
        <OperationsOverview data={data} onBooking={onOpenBooking} onProduct={onProduct} />
      </aside>
    </div>
  </div>;
}
