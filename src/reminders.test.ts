import assert from "node:assert/strict";
import type { Booking, RentalData } from "./model.ts";
import { leadMs, reminderTimes } from "./reminders.ts";

const hour = 60 * 60 * 1000;
const now = Date.parse("2026-10-01T09:00:00Z");
const booking = (id: string, startAt: string, endAt: string, over: Partial<Booking> = {}): Booking => ({ id, productId: "p1", referenceCode: id, customerName: "A", customerPhone: "", startAt, endAt, approvalStatus: "approved", rentalStatus: "reserved", workflowVersion: 1, workflowSnapshot: [], notificationsEnabled: true, ...over });

const base: RentalData = {
  workspaceId: "w1", workspaceName: "W", plan: "free", onboardingCompleted: true, termsAccepted: true, privacyAccepted: true,
  categories: [], groups: [], fieldDefinitions: [], products: [{ id: "p1", groupId: "g1", name: "K5", identifier: "", status: "available", fields: {} }],
  workflow: [], bookings: [], stepRuns: [], itemRecords: [], issues: [],
};

const at = (offsetHours: number) => new Date(now + offsetHours * hour).toISOString();

const two = reminderTimes({ ...base, bookings: [booking("b1", at(5), at(8))] }, now);
assert.equal(two.length, 2, "대여 2시간 전과 반납 2시간 전 두 건을 만든다");
assert.equal(two[0].at, now + 3 * hour, "대여 알림은 시작 2시간 전");
assert.equal(two[1].at, now + 6 * hour, "반납 알림은 종료 2시간 전");
assert.equal(two[0].key, "b1:rental_before");
assert.equal(two[0].product, "K5");

assert.deepEqual(reminderTimes({ ...base, bookings: [booking("b1", at(5), at(8), { notificationsEnabled: false })] }, now), [], "알림을 끈 예약은 제외한다");
assert.deepEqual(reminderTimes({ ...base, bookings: [booking("b1", at(5), at(8), { approvalStatus: "rejected" })] }, now), [], "거절된 예약은 제외한다");
assert.deepEqual(reminderTimes({ ...base, bookings: [booking("b1", at(5), at(8), { rentalStatus: "cancelled" })] }, now), [], "취소된 예약은 제외한다");
assert.deepEqual(reminderTimes({ ...base, bookings: [booking("b1", at(5), at(8), { rentalStatus: "returned" })] }, now), [], "회수 완료된 예약은 제외한다");
assert.equal(reminderTimes({ ...base, bookings: [booking("b1", at(5), at(8), { rentalStatus: "checked_out" })] }, now).length, 1, "대여 중이면 반납 알림만 남는다");
assert.deepEqual(reminderTimes({ ...base, bookings: [booking("b1", at(1), at(1.5))] }, now), [], "이미 지난 시각은 넣지 않는다");
assert.equal(leadMs, 2 * 60 * 60 * 1000, "알림 시각은 2시간 전");

console.log("Local reminder schedule checks passed");

