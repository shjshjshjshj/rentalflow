import assert from "node:assert/strict";
import { bookingNotificationSchedule, bookingViewState, canReleaseAsset, transitionBooking, type BookingState } from "./domain.ts";
import { industryTemplates, makeTemplateWorkflow } from "./workflow-templates.ts";

const booking: BookingState = {
  id: "R-TEST",
  approvalStatus: "pending",
  rentalStatus: "reserved",
  startAt: "2026-08-25T10:00:00.000Z",
  endAt: "2026-08-25T18:00:00.000Z",
};

const approved = transitionBooking(booking, "approve", "2026-08-25T09:00:00.000Z");
const checkedOut = transitionBooking(approved, "check_out", "2026-08-25T10:00:00.000Z");
const returned = transitionBooking(checkedOut, "return_received", "2026-08-25T17:00:00.000Z");
assert.equal(bookingViewState(booking, "2026-08-25T11:00:00.000Z"), "approval_overdue");
assert.equal(bookingViewState(approved, "2026-08-25T09:30:00.000Z"), "confirmed");
assert.equal(bookingViewState(approved, "2026-08-25T11:00:00.000Z"), "pickup_overdue");
assert.equal(canReleaseAsset(returned), true);
assert.equal(canReleaseAsset(returned, 1), false);
assert.throws(() => transitionBooking(checkedOut, "cancel"), /INVALID_TRANSITION/);
const notifications = bookingNotificationSchedule(booking.id, "K5 1234", booking.startAt, booking.endAt);
assert.deepEqual(notifications.map(item => item.scheduledAt), ["2026-08-25T08:00:00.000Z", "2026-08-25T16:00:00.000Z"]);
assert.equal(new Set(notifications.map(item => item.dedupeKey)).size, 2);
assert.throws(() => bookingNotificationSchedule(booking.id, "K5", "invalid", booking.endAt), /INVALID_TIME/);
const stayWorkflow = makeTemplateWorkflow(crypto.randomUUID(), "stay");
assert.equal(industryTemplates().find(item => item.id === "stay")?.productExample, "디럭스 201호");
assert.equal(stayWorkflow[0].outcomes.find(item => item.label === "보완 필요")?.action, "hold_booking");
assert.ok(stayWorkflow.flatMap(step => step.items).some(item => item.completionType === "photo"));
assert.ok(stayWorkflow.flatMap(step => step.items).some(item => item.completionType === "note"));
console.log("Product domain checks passed");

import { finishRun, isRunAvailable, confirmRentalEvent, calendarBookings } from "./domain.ts";
import type { RentalData, WorkflowStep } from "./model.ts";
const step = (id: string, order: number): WorkflowStep => ({ id, groupId: "g", triggerType: "booking_confirmed", name: id, sortOrder: order, resultMode: "branch", outcomes: [{ label: "승인", action: "continue" }, { label: "보완", action: "hold_booking" }, { label: "거절", action: "cancel_booking" }], items: [] });
const a = step("a",0), b = step("b",1);
const state: RentalData = { workspaceId:"w",workspaceName:"test",plan:"free",onboardingCompleted:true,termsAccepted:true,privacyAccepted:true,categories:[],groups:[],fieldDefinitions:[],workflow:[a,b],products:[{id:"p",groupId:"g",name:"test",identifier:"",status:"available",fields:{}}],bookings:[{id:"r",productId:"p",referenceCode:"r",customerName:"test",customerPhone:"",startAt:"2099-01-01T00:00:00Z",endAt:"2099-01-02T00:00:00Z",approvalStatus:"pending",rentalStatus:"reserved",workflowVersion:1,workflowSnapshot:[a,b],notificationsEnabled:true}],stepRuns:[a,b].map(step => ({id:step.id,bookingId:"r",stepSnapshot:step,triggerType:step.triggerType,sortOrder:step.sortOrder,status:"open"})),itemRecords:[],issues:[]};
assert.equal(isRunAvailable(state.stepRuns[1],state),false);
assert.throws(() => finishRun(state,"b",b.outcomes[0]));
const afterA = finishRun(state,"a",a.outcomes[0]);
assert.equal(afterA.bookings[0].approvalStatus,"pending");
assert.equal(isRunAvailable(afterA.stepRuns[1],afterA),true);
const afterB = finishRun(afterA,"b",b.outcomes[0]);
assert.equal(afterB.bookings[0].approvalStatus,"approved");
assert.equal(afterB.bookings[0].rentalStatus,"reserved");
const missing = structuredClone(state);
missing.itemRecords.push({id:"i",stepRunId:"a",sortOrder:0,status:"pending",itemSnapshot:{id:"i",stepId:"a",title:"document",completionType:"photo",required:true,config:{},sortOrder:0}});
assert.throws(() => finishRun(missing,"a",a.outcomes[0]));
assert.equal(finishRun(missing,"a",a.outcomes[1]).bookings[0].approvalStatus,"needs_supplement");
const rejected=finishRun(missing,"a",a.outcomes[2]);
assert.equal(rejected.bookings[0].rentalStatus,"cancelled");
assert.equal(isRunAvailable(rejected.stepRuns[1],rejected),false);
const handed=confirmRentalEvent(afterB,"r","check_out");
assert.equal(handed.bookings[0].rentalStatus,"checked_out");
assert.throws(() => confirmRentalEvent(handed,"r","cancel"));
const received=confirmRentalEvent(handed,"r","return_received");
assert.equal(received.products[0].status,"available");
const problem=structuredClone(handed);
problem.issues.push({id:"x",productId:"p",type:"damage",note:"",status:"open"});
assert.equal(confirmRentalEvent(problem,"r","return_received").products[0].status,"inspection");
const calendarDay = new Date("2026-08-25T00:00:00");
const contract = (id: string, startAt: string, endAt: string) => ({ ...state.bookings[0], id, startAt, endAt });
const first = { ...contract("first", "2026-08-25T09:00:00", "2026-08-25T10:00:00"), rentalStatus: "returned" as const };
const second = contract("second", "2026-08-25T10:00:00", "2026-08-25T11:00:00");
const midnightReturn = contract("midnight", "2026-08-24T09:00:00", "2026-08-25T00:00:00");
const calendarInput = [second, first, midnightReturn, { ...first, id: "cancelled", rentalStatus: "cancelled" as const }, { ...second, id: "rejected", approvalStatus: "rejected" as const }, contract("tomorrow", "2026-08-26T00:00:00", "2026-08-27T00:00:00"), contract("invalid", "invalid", "2026-08-25"), contract("zero", "2026-08-25", "2026-08-25")];
assert.deepEqual(calendarBookings(calendarInput, calendarDay).map(row => row.id), ["midnight", "first", "second"]);
assert.equal(calendarInput[0].id, "second", "calendar must not mutate contract ordering");
const overdueContract = { ...contract("overdue", "2026-08-20T09:00:00", "2026-08-24T09:00:00"), rentalStatus: "checked_out" as const };
assert.equal(calendarBookings([overdueContract], calendarDay, calendarDay).length, 1, "unreturned contracts remain visible today");
assert.equal(calendarBookings([{ ...overdueContract, rentalStatus: "returned" }], calendarDay, calendarDay).length, 0);
assert.equal(calendarBookings([overdueContract], new Date("2026-08-26"), calendarDay).length, 0, "do not invent future schedule cards for overdue contracts");
assert.equal(calendarBookings([contract("dst", "2026-03-08T00:00:00", "2026-03-09T00:00:00")], new Date("2026-03-08T00:00:00")).length, 1);
const nextRental = structuredClone(handed);
nextRental.bookings.push({ ...nextRental.bookings[0], id: "next", rentalStatus: "reserved", startAt: "2099-01-03T00:00:00Z", endAt: "2099-01-04T00:00:00Z" });
assert.throws(() => confirmRentalEvent(nextRental, "next", "check_out"), /errors\.productNotReady/, "future reservations do not bypass physical return");
assert.equal(confirmRentalEvent(confirmRentalEvent(nextRental, "r", "return_received"), "next", "check_out").bookings[1].rentalStatus, "checked_out");
console.log("Workflow sequence, exception, handover and calendar checks passed");

import { hasPendingInspection } from "./domain.ts";
const inspecting = structuredClone(received);
const inspection = { ...a, id: "inspection", triggerType: "return_minus_2h" as const, outcomes: [{label:"정상", action:"make_available" as const}] };
inspecting.stepRuns.push(...[0,1].map(order => ({id:"inspection"+order,bookingId:"r",stepSnapshot:{...inspection,sortOrder:order},triggerType:inspection.triggerType,sortOrder:order,status:"open" as const})));
inspecting.products[0].status = "inspection";
assert.equal(hasPendingInspection(inspecting,"p"),true);
const firstInspection = finishRun(inspecting,"inspection0",inspection.outcomes[0]);
assert.equal(firstInspection.products[0].status,"inspection");
const lastInspection = finishRun(firstInspection,"inspection1",inspection.outcomes[0]);
assert.equal(lastInspection.products[0].status,"available");
assert.equal(hasPendingInspection(lastInspection,"p"),false);
console.log("Pending inspection release checks passed");

const preparation = structuredClone(afterB);
preparation.bookings[0].startAt = "2020-01-01T00:00:00Z";
const prep = {...a, id:"prep", triggerType:"rental_minus_2h" as const};
preparation.stepRuns.push({id:"prep",bookingId:"r",stepSnapshot:prep,triggerType:prep.triggerType,sortOrder:0,status:"open"});
const heldPreparation = finishRun(preparation,"prep",prep.outcomes[1]);
assert.equal(isRunAvailable(heldPreparation.stepRuns.at(-1)!,heldPreparation),true);
const resumedPreparation = finishRun(heldPreparation,"prep",prep.outcomes[0]);
assert.equal(resumedPreparation.bookings[0].approvalStatus,"approved");
assert.equal(resumedPreparation.bookings[0].rentalStatus,"reserved");
console.log("Preparation hold and resume checks passed");

const stopped = structuredClone(firstInspection);
stopped.products[0].status = "unavailable";
assert.equal(finishRun(stopped,"inspection1",inspection.outcomes[0]).products[0].status,"unavailable");
const stoppedRental = structuredClone(handed);
stoppedRental.products[0].status = "unavailable";
assert.equal(confirmRentalEvent(stoppedRental,"r","return_received").products[0].status,"unavailable");
console.log("Manual product stop survives return and inspection completion");

import { todaySchedule, widgetSnapshot, widgetSetup, widgetLink } from "./domain.ts";
import type { Booking, Product } from "./model.ts";
const localTime = (day: string, hour: number, minute = 0) => new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
const plan = (id: string, startAt: string, endAt: string, overrides: Partial<Booking> = {}): Booking => ({ id, productId: "p1", referenceCode: id, customerName: "고객", customerPhone: "010-0000-0000", startAt, endAt, approvalStatus: "not_required", rentalStatus: "reserved", workflowVersion: 1, workflowSnapshot: [], notificationsEnabled: true, ...overrides });
const widgetProduct = (id: string, name: string): Product => ({ id, groupId: "g", name, identifier: "", status: "available", fields: {} });
const widgetData = (bookings: Booking[], products: Product[] = [widgetProduct("p1", "아반떼")]) => ({ ...state, products, bookings });
const widgetDay = new Date("2026-09-22T12:00:00");

// Date and status rules must match the home screen list.
const todayRental = plan("today-rental", localTime("2026-09-22", 9), localTime("2026-09-24", 18));
const todayReturn = plan("today-return", localTime("2026-09-20", 9), localTime("2026-09-22", 15), { rentalStatus: "checked_out" });
const handedOver = plan("handed-over", localTime("2026-09-22", 8), localTime("2026-09-23", 18), { rentalStatus: "checked_out" });
const done = plan("done", localTime("2026-09-22", 7), localTime("2026-09-22", 11), { rentalStatus: "returned" });
const cancelled = plan("cancelled", localTime("2026-09-22", 6), localTime("2026-09-22", 7), { rentalStatus: "cancelled" });
const tomorrow = plan("tomorrow", localTime("2026-09-23", 9), localTime("2026-09-24", 18));
const midnightHandback = plan("midnight", localTime("2026-09-21", 9), localTime("2026-09-22", 0), { rentalStatus: "checked_out" });
const schedule = todaySchedule([todayRental, handedOver, done, cancelled, tomorrow, todayReturn, midnightHandback], widgetDay);
assert.deepEqual(schedule.map(row => `${row.label}:${row.booking.id}:${new Date(row.at).getHours()}`), ["return:midnight:0", "pickup:today-rental:9", "return:today-return:15"]);
assert.ok(schedule.every(row => row.booking.id !== "done" && row.booking.id !== "cancelled" && row.booking.id !== "tomorrow"));
assert.equal(schedule.some(row => row.booking.id === "handed-over" && row.label === "pickup"), false, "a handed over contract is no longer an upcoming rental");
assert.equal(todaySchedule([plan("broken", "", "")], widgetDay).length, 0, "unreadable timestamps never render as today");
assert.equal(todaySchedule([todayRental], widgetDay).length, 1);
assert.equal(todaySchedule([{ ...todayRental, ...transitionBooking(todayRental, "check_out", widgetDay) }], widgetDay).length, 0, "completing pickup removes it from today's remaining schedule");
assert.equal(todaySchedule([todayReturn], widgetDay).length, 1);
assert.equal(todaySchedule([{ ...todayReturn, ...transitionBooking(todayReturn, "return_received", widgetDay) }], widgetDay).length, 0, "completing return removes it from today's remaining schedule");

// The widget keeps the day's next events and never claims a day it can no longer see.
const busy = widgetData([
  plan("morning", localTime("2026-09-22", 8), localTime("2026-09-23", 9)),
  plan("noon", localTime("2026-09-22", 12), localTime("2026-09-23", 9)),
  plan("evening", localTime("2026-09-22", 17), localTime("2026-09-23", 9)),
  plan("night", localTime("2026-09-22", 20), localTime("2026-09-23", 9)),
  plan("missing-product", localTime("2026-09-22", 21), localTime("2026-09-23", 9), { productId: "unknown" }),
]);
const snapshot = widgetSnapshot(busy, widgetDay);
assert.equal(snapshot.v, 1);
assert.equal(snapshot.state, "ready");
assert.equal(snapshot.day, "2026-09-22");
assert.equal(snapshot.updatedAt, widgetDay.getTime());
assert.equal(snapshot.rentalCount, 5);
assert.equal(snapshot.returnCount, 0);
assert.deepEqual(snapshot.items.map(item => item.id), ["noon", "evening", "night"], "past events make room for the next ones, capped at three");
assert.deepEqual(snapshot.items.map(item => item.kind), ["rental", "rental", "rental"]);
assert.ok(snapshot.items.every(item => item.at > 0 && typeof item.product === "string"));
const lateDay = widgetSnapshot(busy, new Date("2026-09-22T23:30:00"));
assert.deepEqual(lateDay.items.map(item => item.id), ["evening", "night", "missing-product"], "the tail of the day still shows the last events");
assert.equal(lateDay.items[2].product, "상품", "a deleted product falls back to a neutral label");
const mixedDay = widgetData([todayRental, todayReturn]);
assert.deepEqual(widgetSnapshot(mixedDay, widgetDay).items.map(item => item.kind), ["return"], "an event that already passed makes room for the next one");
assert.deepEqual(widgetSnapshot(mixedDay, new Date("2026-09-22T06:00:00")).items.map(item => item.kind), ["rental", "return"]);
const otherAccount = widgetSnapshot(widgetData([plan("other-workspace", localTime("2026-09-22", 10), localTime("2026-09-23", 9))]), widgetDay);
assert.ok(otherAccount.items.every(item => item.id === "other-workspace"), "a snapshot only ever carries the account that produced it");
assert.equal(widgetSnapshot(widgetData([]), widgetDay).items.length, 0);
assert.deepEqual(widgetSetup(), { v: 1, state: "onboarding" }, "a workspace that is still being set up says so instead of showing numbers");

// Deep link parsing accepts only this widget's own links; the OAuth callback shares the scheme.
assert.equal(widgetLink(`rentalflow://today?booking=${crypto.randomUUID()}`)?.type, "booking", "generated booking ids are accepted");
assert.deepEqual(widgetLink("rentalflow://today?booking=a1b2c3d4-0000-4000-8000-000000000001"), { type: "booking", bookingId: "a1b2c3d4-0000-4000-8000-000000000001" });
assert.deepEqual(widgetLink("rentalflow://today?new=1"), { type: "new-booking" });
assert.deepEqual(widgetLink("rentalflow://today?refresh=1"), { type: "refresh" });
assert.deepEqual(widgetLink("rentalflow://today?new=1&booking=a1b2c3d4-0000-4000-8000-000000000001"), { type: "new-booking" });
assert.equal(widgetLink("rentalflow://auth/callback?code=abc"), null, "the OAuth callback must not open a booking");
assert.equal(widgetLink("https://today?booking=a1b2c3d4-0000-4000-8000-000000000001"), null);
assert.equal(widgetLink("rentalflow://today?booking=../../etc/passwd"), null);
assert.equal(widgetLink("rentalflow://today?booking=short"), null);
assert.equal(widgetLink(""), null);
assert.equal(widgetLink("not a url"), null);
console.log("Today schedule, widget snapshot and widget link checks passed");
