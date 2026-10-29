import type { Booking, RentalData, StepRun, WorkflowOutcome } from "./model";
import { t } from "./i18n/index.ts";
import { dayKey, getTimeZone } from "./region.ts";
export type ApprovalStatus = "not_required" | "pending" | "needs_supplement" | "approved" | "rejected";
export type RentalStatus = "reserved" | "checked_out" | "returning" | "returned" | "cancelled";
export type BookingEvent = "approve" | "request_supplement" | "reject" | "cancel" | "check_out" | "early_return" | "return_received";

export interface BookingState {
  id: string;
  approvalStatus: ApprovalStatus;
  rentalStatus: RentalStatus;
  startAt: string;
  endAt: string;
  approvalUpdatedAt?: string;
  checkedOutAt?: string;
  earlyReturnAt?: string;
  returnedAt?: string;
}

const approvalEvents: Partial<Record<BookingEvent, ApprovalStatus>> = {
  approve: "approved",
  request_supplement: "needs_supplement",
  reject: "rejected",
};

export function transitionBooking(booking: BookingState, event: BookingEvent, at: Date | string = new Date()): BookingState {
  const next = structuredClone(booking);
  const now = new Date(at);
  if (Number.isNaN(now.getTime())) throw new Error("INVALID_TIME");

  const approval = approvalEvents[event];
  if (approval) {
    if (next.rentalStatus !== "reserved" || !["pending", "needs_supplement"].includes(next.approvalStatus)) throw new Error("INVALID_TRANSITION");
    next.approvalStatus = approval;
    next.approvalUpdatedAt = now.toISOString();
    if (event === "reject") next.rentalStatus = "cancelled";
    return next;
  }

  if (event === "cancel") {
    if (next.rentalStatus !== "reserved" || now >= new Date(next.startAt)) throw new Error("INVALID_TRANSITION");
    next.rentalStatus = "cancelled";
  } else if (event === "check_out") {
    if (next.rentalStatus !== "reserved" || !["approved", "not_required"].includes(next.approvalStatus)) throw new Error("INVALID_TRANSITION");
    next.rentalStatus = "checked_out";
    next.checkedOutAt = now.toISOString();
  } else if (event === "early_return") {
    if (next.rentalStatus !== "checked_out") throw new Error("INVALID_TRANSITION");
    next.rentalStatus = "returning";
    next.endAt = now.toISOString();
    next.earlyReturnAt = now.toISOString();
  } else if (event === "return_received") {
    if (!["checked_out", "returning"].includes(next.rentalStatus)) throw new Error("INVALID_TRANSITION");
    next.rentalStatus = "returned";
    next.returnedAt = now.toISOString();
  } else {
    throw new Error("UNKNOWN_EVENT");
  }
  return next;
}

export function bookingViewState(booking: BookingState, at: Date | string = new Date()) {
  const now = new Date(at);
  if (booking.rentalStatus === "cancelled") return "cancelled";
  if (booking.rentalStatus === "returned") return "returned";
  if (booking.rentalStatus === "returning") return now > new Date(booking.endAt) ? "return_overdue" : "returning";
  if (booking.rentalStatus === "checked_out") return now > new Date(booking.endAt) ? "return_overdue" : "active";
  if (booking.approvalStatus === "needs_supplement") return now >= new Date(booking.startAt) ? "supplement_overdue" : "needs_supplement";
  if (booking.approvalStatus === "pending") return now >= new Date(booking.startAt) ? "approval_overdue" : "pending_approval";
  // 승인은 끝났는데 인도 시각이 지나도록 나가지 않은 계약. 캘린더 색만으로는 드러나지 않는다.
  if (now >= new Date(booking.startAt)) return "pickup_overdue";
  return "confirmed";
}

export function canReleaseAsset(booking: BookingState, openIssues = 0, otherActiveBookings = 0) {
  return booking.rentalStatus === "returned" && openIssues === 0 && otherActiveBookings === 0;
}

export function bookingNotificationSchedule(bookingId: string, productName: string, startAt: string, endAt: string) {
  const twoHoursBefore = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("INVALID_TIME");
    return new Date(date.getTime() - 2 * 60 * 60_000).toISOString();
  };
  return [
    { eventType: "rental_before", title: t("trigger.rental_minus_2h"), body: t("push.rentalBody", { product: productName }), scheduledAt: twoHoursBefore(startAt), dedupeKey: `${bookingId}:rental_before` },
    { eventType: "return_before", title: t("trigger.return_minus_2h"), body: t("push.returnBody", { product: productName }), scheduledAt: twoHoursBefore(endAt), dedupeKey: `${bookingId}:return_before` },
  ];
}

export function isRunAvailable(run: StepRun, data: RentalData, now = Date.now()) {
  const booking = data.bookings.find(item => item.id === run.bookingId);
  if (!booking || booking.rentalStatus === "cancelled" || !["open", "locked"].includes(run.status)) return false;
  if (data.stepRuns.some(item => item.bookingId === run.bookingId && item.triggerType === run.triggerType && item.sortOrder < run.sortOrder && !["completed", "skipped"].includes(item.status))) return false;
  if (run.triggerType === "booking_confirmed") return booking.rentalStatus === "reserved";
  const resuming = booking.approvalStatus === "needs_supplement" && run.stepSnapshot.outcomes.some(item => item.action === "hold_booking" && item.label === run.outcome);
  if (!["approved", "not_required"].includes(booking.approvalStatus) && !resuming) return false;
  if (run.triggerType === "manual") return true;
  if (run.triggerType === "rental_minus_2h") return booking.rentalStatus === "reserved" && now >= +new Date(booking.startAt) - 7200000;
  return booking.rentalStatus === "returned" || (["checked_out", "returning"].includes(booking.rentalStatus) && now >= +new Date(booking.endAt) - 7200000);
}

export const needsCompletedItems = (outcome: WorkflowOutcome) => ["continue", "make_available"].includes(outcome.action);

export function finishRun(data: RentalData, runId: string, outcome: WorkflowOutcome): RentalData {
  const run = data.stepRuns.find(item => item.id === runId);
  const booking = data.bookings.find(item => item.id === run?.bookingId);
  if (!run || !booking || !isRunAvailable(run, data)) throw new Error("errors.runUnavailable");
  if (!run.stepSnapshot.outcomes.some(item => item.action === outcome.action && item.label === outcome.label)) throw new Error("errors.invalidOutcome");
  if (needsCompletedItems(outcome) && data.itemRecords.some(item => item.stepRunId === runId && item.itemSnapshot.required && item.status !== "completed")) throw new Error("errors.requiredItems");
  if (["hold_booking", "cancel_booking"].includes(outcome.action) && booking.rentalStatus !== "reserved") throw new Error("errors.alreadyRented");
  const next = structuredClone(data);
  const updated = next.bookings.find(item => item.id === booking.id)!;
  if (outcome.action === "hold_booking") {
    updated.approvalStatus = "needs_supplement";
    next.stepRuns.find(item => item.id === runId)!.outcome = outcome.label;
    return next;
  }
  Object.assign(next.stepRuns.find(item => item.id === runId)!, { status: "completed", outcome: outcome.label });
  if (outcome.action === "cancel_booking") {
    updated.approvalStatus = "rejected";
    updated.rentalStatus = "cancelled";
    next.stepRuns.filter(item => item.bookingId === booking.id && item.status !== "completed").forEach(item => { item.status = "skipped"; });
    return next;
  }
  if (outcome.action === "create_issue") {
    next.issues.push({ id: crypto.randomUUID(), bookingId: booking.id, productId: booking.productId, type: outcome.label, note: t("issue.fromStep", { step: run.stepSnapshot.name }), status: "open" });
    next.products.find(item => item.id === booking.productId)!.status = "inspection";
  }
  const remaining = next.stepRuns.filter(item => item.bookingId === booking.id && item.triggerType === run.triggerType && !["completed", "skipped"].includes(item.status)).sort((a,b) => a.sortOrder - b.sortOrder);
  if (remaining[0]) remaining[0].status = "open";
  else if (run.triggerType === "booking_confirmed") updated.approvalStatus = "approved";
  if (run.triggerType !== "booking_confirmed" && updated.approvalStatus === "needs_supplement") updated.approvalStatus = "approved";
  // Preparation never confirms physical handover or receipt.
  if (outcome.action === "make_available" && next.products.find(item => item.id === booking.productId)?.status !== "unavailable" && !hasPendingInspection(next, booking.productId) && canReleaseAsset(updated, next.issues.filter(item => item.productId === booking.productId && item.status === "open").length, next.bookings.filter(item => item.id !== booking.id && item.productId === booking.productId && ["checked_out", "returning"].includes(item.rentalStatus)).length)) {
    next.products.find(item => item.id === booking.productId)!.status = "available";
  }
  return next;
}

export function hasPendingInspection(data: RentalData, productId: string) {
  return data.stepRuns.some(run => run.triggerType === "return_minus_2h" && !["completed", "skipped"].includes(run.status) && data.bookings.some(booking => booking.id === run.bookingId && booking.productId === productId && booking.rentalStatus === "returned"));
}

export function confirmRentalEvent(data: RentalData, bookingId: string, event: "check_out" | "return_received" | "cancel"): RentalData {
  const booking = data.bookings.find(item => item.id === bookingId);
  if (!booking) throw new Error("errors.bookingNotFound");
  if (event === "check_out") {
    if (data.stepRuns.some(item => item.bookingId === bookingId && ["booking_confirmed", "rental_minus_2h"].includes(item.triggerType) && !["completed", "skipped"].includes(item.status))) throw new Error("errors.preparationPending");
    if (data.issues.some(item => item.productId === booking.productId && item.status === "open") || data.products.some(item => item.id === booking.productId && ["inspection", "unavailable"].includes(item.status)) || data.bookings.some(item => item.id !== bookingId && item.productId === booking.productId && ["checked_out", "returning"].includes(item.rentalStatus))) throw new Error("errors.productNotReady");
  }
  const next = structuredClone(data);
  Object.assign(next.bookings.find(item => item.id === bookingId)!, transitionBooking(booking, event));
  if (event === "cancel") next.stepRuns.filter(item => item.bookingId === bookingId && item.status !== "completed").forEach(item => { item.status = "skipped"; });
  else {
    const inspectionPending = next.stepRuns.some(item => item.bookingId === bookingId && item.triggerType === "return_minus_2h" && !["completed", "skipped"].includes(item.status));
    const product = next.products.find(item => item.id === booking.productId)!;
    if (product.status !== "unavailable") product.status = event === "check_out" ? "rented" : inspectionPending || next.issues.some(item => item.productId === booking.productId && item.status === "open") ? "inspection" : next.bookings.some(item => item.id !== bookingId && item.productId === booking.productId && ["checked_out", "returning"].includes(item.rentalStatus)) ? "rented" : "available";
  }
  return next;
}

// One card per stored contract. Include the return date, even at midnight.
export function calendarBookings(bookings: Booking[], date: Date | string, today: Date | string = new Date(), zone = getTimeZone()) {
  const selected = typeof date === "string" ? date : dayKey(date, zone);
  const todayKey = typeof today === "string" ? today : dayKey(today, zone);
  return bookings.filter(booking => {
    if (booking.rentalStatus === "cancelled" || booking.approvalStatus === "rejected") return false;
    const from = +new Date(booking.startAt), to = +new Date(booking.endAt);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false;
    const fromDay = dayKey(booking.startAt, zone), toDay = dayKey(booking.endAt, zone);
    const overdue = selected === todayKey && ["checked_out", "returning"].includes(booking.rentalStatus) && toDay < selected;
    return (fromDay <= selected && toDay >= selected) || overdue;
  }).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt) || a.id.localeCompare(b.id));
}

// Today's handover list, shared by the home screen and the Android home screen widget.
// Same rules as the home screen: cancelled/returned contracts are done, rentals only count while reserved.
export interface TodayScheduleItem { booking: Booking; at: string; label: "pickup" | "return" }

export function todaySchedule(bookings: Booking[], today = new Date(), zone = getTimeZone()): TodayScheduleItem[] {
  const sameDay = (value: string) => Number.isFinite(Date.parse(value)) && dayKey(value, zone) === dayKey(today, zone);
  return bookings
    .filter(item => !["cancelled", "returned"].includes(item.rentalStatus) && item.approvalStatus !== "rejected")
    .flatMap(item => [
      ...(sameDay(item.startAt) && item.rentalStatus === "reserved" ? [{ booking: item, at: item.startAt, label: "pickup" as const }] : []),
      ...(sameDay(item.endAt) ? [{ booking: item, at: item.endAt, label: "return" as const }] : []),
    ])
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));
}

// The widget renders at most three rows, so it keeps the day's next events and falls back to the last ones.
export const widgetItemLimit = 3;

export interface WidgetSnapshot {
  v: 1;
  state: "ready";
  day: string;
  timeZone: string;
  updatedAt: number;
  rentalCount: number;
  returnCount: number;
  items: Array<{ id: string; at: number; kind: "rental" | "return"; product: string }>;
}

export function widgetSnapshot(data: RentalData, now = new Date()): WidgetSnapshot {
  const schedule = todaySchedule(data.bookings, now, data.timeZone);
  const upcoming = schedule.findIndex(item => +new Date(item.at) >= now.getTime() - 60_000);
  const start = upcoming < 0 ? Math.max(0, schedule.length - widgetItemLimit) : upcoming;
  return {
    v: 1,
    state: "ready",
    day: dayKey(now, data.timeZone),
    timeZone: data.timeZone ?? getTimeZone(),
    updatedAt: now.getTime(),
    rentalCount: schedule.filter(item => item.label === "pickup").length,
    returnCount: schedule.filter(item => item.label === "return").length,
    items: schedule.slice(start, start + widgetItemLimit).map(item => ({
      id: item.booking.id,
      at: +new Date(item.at),
      kind: item.label === "pickup" ? "rental" : "return",
      product: data.products.find(product => product.id === item.booking.productId)?.name.trim().slice(0, 40) || t("common.item"),
    })),
  };
}

// Signed in, but the workspace is not set up yet: the widget says so instead of showing numbers it does not have.
export interface WidgetSetup { v: 1; state: "onboarding" }

export function widgetSetup(): WidgetSetup {
  return { v: 1, state: "onboarding" };
}

// Widget taps arrive as rentalflow://today?… links. Everything outside this exact shape is ignored:
// the OAuth callback uses the same scheme, and the rendered ids come from an untrusted home screen cache.
export type WidgetLink = { type: "booking"; bookingId: string } | { type: "new-booking" } | { type: "refresh" };

export function widgetLink(raw: string): WidgetLink | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "rentalflow:" || url.hostname !== "today") return null;
  if (url.searchParams.get("new") === "1") return { type: "new-booking" };
  if (url.searchParams.get("refresh") === "1") return { type: "refresh" };
  const bookingId = url.searchParams.get("booking") || "";
  return /^[\w-]{8,64}$/.test(bookingId) ? { type: "booking", bookingId } : null;
}
