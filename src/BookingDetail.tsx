

import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Phone, Check, AlertTriangle } from "lucide-react";
import type { Booking, RentalData, StepRun, Issue } from "./model";
import { approvalLabel, rentalLabel, triggerLabel } from "./model";
import { isRunAvailable, confirmRentalEvent } from "./domain";
import { formatPrice, formatShortDateTime, t, tp, tt } from "./i18n";

type Props = {
  data: RentalData; booking: Booking; busy: boolean;
  onClose: () => void; onEdit: () => void; onRun: (run: StepRun) => void;
  onIssue: (issue: Issue) => void;
  onEvent: (id: string, event: "check_out" | "return_received") => Promise<void>;
};
const triggers = ["booking_confirmed","rental_minus_2h","return_minus_2h","manual"] as const;

export default function BookingDetail({ data, booking, busy, onClose, onEdit, onRun, onIssue, onEvent }: Props) {
  const product = data.products.find(item => item.id === booking.productId);
  const runs = data.stepRuns.filter(item => item.bookingId === booking.id);
  const issues = data.issues.filter(item => item.bookingId === booking.id && item.status === "open");
  const [error, setError] = useState("");
  const action = booking.rentalStatus === "reserved" ? "check_out" : ["checked_out","returning"].includes(booking.rentalStatus) ? "return_received" : null;
  let blocked = "";
  if (action) {
    try { confirmRentalEvent(data, booking.id, action); } catch (caught) { blocked = (caught as Error).message === "INVALID_TRANSITION" ? t("detail.approvalFirst") : tt((caught as Error).message); }
  }
  const next = runs.filter(item => isRunAvailable(item,data)).sort((a,b) => triggers.indexOf(a.triggerType)-triggers.indexOf(b.triggerType)||a.sortOrder-b.sortOrder)[0];
  return <div className="booking-detail-page" role="dialog" aria-modal="true" aria-label={t("detail.aria")}>
    <header className="booking-detail-bar"><button className="icon-button" aria-label={t("common.back")} disabled={busy} onClick={onClose}><ChevronLeft size={22}/></button><strong>{t("detail.title")}</strong><button className="icon-button" aria-label={t("detail.editAria")} disabled={busy} onClick={onEdit}><Pencil size={19}/></button></header>
    <main className="booking-detail-body">
      {booking.rentalStatus === "reserved" && <p className="booking-approval" role="status">{approvalLabel(booking.approvalStatus)}</p>}
      <section className="booking-summary"><small>{booking.referenceCode} · {rentalLabel(booking.rentalStatus)}</small><h1>{product?.name}</h1><p>{product?.identifier}</p><div className="booking-customer"><strong>{booking.customerName}</strong>{booking.customerPhone && <a href={"tel:"+booking.customerPhone}><Phone size={16}/>{booking.customerPhone}</a>}</div><dl><div><dt>{t("booking.start")}</dt><dd>{formatShortDateTime(booking.startAt)}</dd></div><div><dt>{t("booking.end")}</dt><dd>{formatShortDateTime(booking.endAt)}</dd></div>{booking.checkedOutAt && <div><dt>{t("booking.checkedOutAt")}</dt><dd>{formatShortDateTime(booking.checkedOutAt)}</dd></div>}{booking.returnedAt && <div><dt>{t("booking.returnedAt")}</dt><dd>{formatShortDateTime(booking.returnedAt)}</dd></div>}{booking.price !== undefined && <div><dt>{t("booking.price")}</dt><dd>{formatPrice(booking.price)}</dd></div>}</dl>{booking.memo && <p className="booking-memo">{booking.memo}</p>}</section>
      {issues.length > 0 && <section className="booking-alert"><AlertTriangle size={18}/><div><strong>{tp("detail.openIssues", issues.length)}</strong>{issues.map(item => <button className="booking-issue-link" key={item.id} onClick={() => onIssue(item)}><span>{item.type} · {item.note}</span><ChevronRight size={18}/></button>)}</div></section>}
      <section className="booking-procedure"><h2>{t("detail.procedure")}</h2>{triggers.map(trigger => {
        const rows = runs.filter(item => item.triggerType===trigger).sort((a,b)=>a.sortOrder-b.sortOrder);
        if (!rows.length) return null;
        return <div className="booking-trigger" key={trigger}><h3>{triggerLabel(trigger)}</h3>{rows.map(run => {
          const ready = isRunAvailable(run,data), complete = run.status==="completed";
          return <button key={run.id} disabled={!ready&&!complete} onClick={()=>onRun(run)}><span className={complete?"step-dot complete":"step-dot"}>{complete?<Check size={16}/>:run.sortOrder+1}</span><strong>{run.stepSnapshot.name}</strong><small>{complete?t("detail.recordView"):run.status==="skipped"?t("detail.skipped"):ready?t("detail.available"):t("detail.locked")}</small><ChevronRight size={16}/></button>;
        })}</div>;
      })}{!runs.length&&<p>{t("detail.noTasks")}</p>}</section>
      {error&&<p className="form-error">{tt(error)}</p>}
    </main>
    <footer className="booking-detail-footer">
      {action && !blocked ? <button className="form-primary" disabled={busy} onClick={async()=>{ if (!confirm(action==="check_out"?t("booking.confirmHandover"):t("booking.confirmCollect"))) return; try {await onEvent(booking.id,action);setError("");} catch(caught){setError((caught as Error).message);} }}>{busy?t("common.working"):action==="check_out"?t("booking.handoverButton"):t("booking.collectButton")}</button>
      : next ? <><small>{blocked || t("detail.nextTask")}</small><button className="form-primary" disabled={busy} onClick={()=>onRun(next)}>{next.stepSnapshot.name}<ChevronRight size={18}/></button></>
      : <p>{blocked || (booking.rentalStatus==="cancelled"?t("detail.cancelled"):t("detail.noTaskNow"))}</p>}
    </footer>
  </div>;
}
