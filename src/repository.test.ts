import assert from "node:assert/strict";
import type { Booking, BookingDraft, RentalData } from "./model.ts";
import { validateBooking, validateOnboarding } from "./repository.ts";

const booking = (id: string, startAt: string, endAt: string, rentalStatus: Booking["rentalStatus"] = "reserved"): Booking => ({ id, productId: "p1", referenceCode: id, customerName: "A", customerPhone: "", startAt, endAt, approvalStatus: "approved", rentalStatus, workflowVersion: 1, workflowSnapshot: [], notificationsEnabled: false });

const base: RentalData = {
  workspaceId: "w1", workspaceName: "W", plan: "free", onboardingCompleted: true, termsAccepted: true, privacyAccepted: true,
  categories: [], groups: [{ id: "g1", categoryId: "c1", name: "G", approvalRequired: true, workflowVersion: 1, sortOrder: 0 }],
  fieldDefinitions: [], products: [{ id: "p1", groupId: "g1", name: "P", identifier: "", status: "available", fields: {} }],
  workflow: [], bookings: [], stepRuns: [], itemRecords: [], issues: [],
};

const draft = (over: Partial<BookingDraft> = {}): BookingDraft => ({ productId: "p1", customerName: "A", customerPhone: "", startAt: "2026-10-01T10:00:00+09:00", endAt: "2026-10-01T12:00:00+09:00", notificationsEnabled: false, ...over });

assert.doesNotThrow(() => validateBooking(base, draft()), "겹치는 예약이 없으면 통과한다");
assert.throws(() => validateBooking(base, draft({ endAt: "2026-10-01T09:00:00+09:00" })), /errors\.endBeforeStart/, "끝이 시작보다 앞서면 거부한다");
assert.throws(() => validateBooking(base, draft({ startAt: "그저께" })), /errors\.endBeforeStart/, "읽을 수 없는 시각은 거부한다");
assert.throws(() => validateBooking(base, draft({ price: -1 })), /errors\.invalidPrice/, "음수 금액은 거부한다");
const overlapped: RentalData = { ...base, bookings: [booking("R-1", "2026-10-01T11:00:00+09:00", "2026-10-01T13:00:00+09:00")] };
assert.throws(() => validateBooking(overlapped, draft()), /errors\.bookingConflict\|R-1/, "같은 상품의 겹치는 예약은 거부한다");

const touching: RentalData = { ...base, bookings: [booking("R-2", "2026-10-01T12:00:00+09:00", "2026-10-01T13:00:00+09:00")] };
assert.doesNotThrow(() => validateBooking(touching, draft()), "끝나는 시각에 시작하는 예약은 겹치지 않는다");

const alreadyReturned: RentalData = { ...base, bookings: [booking("R-3", "2026-10-01T11:00:00+09:00", "2026-10-01T13:00:00+09:00", "returned")] };
assert.doesNotThrow(() => validateBooking(alreadyReturned, draft()), "이미 회수한 예약은 중복으로 막지 않는다");

const cancelled: RentalData = { ...base, bookings: [booking("R-4", "2026-10-01T10:00:00+09:00", "2026-10-01T12:00:00+09:00", "cancelled")] };
assert.throws(() => validateBooking(cancelled, draft({ id: "R-4" })), /errors\.cancelledBooking/, "취소된 예약은 수정할 수 없다");

assert.throws(() => validateOnboarding({ categoryName: " ", groupName: "G", productName: "P" } as never), /errors\.onboardingIncomplete/, "종류 이름이 비면 거부한다");
assert.throws(() => validateOnboarding({ categoryName: "C", groupName: "G", productName: "" } as never), /errors\.onboardingIncomplete/, "상품 이름이 비면 거부한다");
assert.doesNotThrow(() => validateOnboarding({ categoryName: "C", groupName: "G", productName: "P" } as never), "이름이 다 있으면 통과한다");

console.log("Local booking rule checks passed");
