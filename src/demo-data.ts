import type { RentalData, WorkflowStep } from "./model";

const workflow: WorkflowStep[] = [
  { id: "ws-1", groupId: "g-1", triggerType: "booking_confirmed", name: "예약 서류 확인", sortOrder: 0, resultMode: "branch", outcomes: [{ label: "승인", action: "continue" }, { label: "보완 필요", action: "hold_booking" }, { label: "승인 불가", action: "cancel_booking" }], items: [{ id: "wi-1", stepId: "ws-1", title: "운전자 정보 확인", completionType: "check", required: true, config: {}, sortOrder: 0 }, { id: "wi-2", stepId: "ws-1", title: "면허 정보 확인", completionType: "check", required: true, config: {}, sortOrder: 1 }] },
  { id: "ws-2", groupId: "g-1", triggerType: "rental_minus_2h", name: "출고 준비", sortOrder: 0, resultMode: "simple", outcomes: [{ label: "완료", action: "continue" }], items: [{ id: "wi-3", stepId: "ws-2", title: "외관 상태 확인", completionType: "check", required: true, config: {}, sortOrder: 0 }, { id: "wi-4", stepId: "ws-2", title: "인도 전 사진", completionType: "photo", required: false, config: {}, sortOrder: 1 }] },
  { id: "ws-3", groupId: "g-1", triggerType: "return_minus_2h", name: "반납 검수", sortOrder: 0, resultMode: "branch", outcomes: [{ label: "정상", action: "make_available" }, { label: "문제 있음", action: "create_issue" }], items: [{ id: "wi-5", stepId: "ws-3", title: "주행거리 기록", completionType: "number", required: true, config: { unit: "km" }, sortOrder: 0 }, { id: "wi-6", stepId: "ws-3", title: "파손 여부 확인", completionType: "check", required: true, config: {}, sortOrder: 1 }] },
];

const snapshot = (groupId: string) => workflow.filter(step => step.groupId === groupId).map(step => structuredClone(step));
const makeRuns = (bookingId: string, steps: WorkflowStep[], statuses?: Array<"locked" | "open" | "completed">) => steps.map((step, index) => ({ id: `run-${bookingId}-${index}`, bookingId, sourceStepId: step.id, stepSnapshot: structuredClone(step), triggerType: step.triggerType, sortOrder: step.sortOrder, status: statuses?.[index] ?? (step.triggerType === "booking_confirmed" ? "open" : "locked") }));

const bookingAWorkflow = snapshot("g-1");
const bookingBWorkflow = snapshot("g-1");
const bookingCWorkflow = snapshot("g-1");

export const demoData: RentalData = {
  workspaceId: "demo-workspace",
  ownerId: "",
  workspaceName: "모빌리티 렌탈 성수",
  plan: "free",
  onboardingCompleted: true,
  termsAccepted: true,
  privacyAccepted: true,
  categories: [{ id: "c-1", name: "승용", sortOrder: 0 }, { id: "c-2", name: "SUV", sortOrder: 1 }],
  groups: [{ id: "g-1", categoryId: "c-1", name: "아반떼", approvalRequired: true, workflowVersion: 1, sortOrder: 0 }, { id: "g-2", categoryId: "c-1", name: "K5", approvalRequired: true, workflowVersion: 1, sortOrder: 1 }, { id: "g-3", categoryId: "c-2", name: "투싼", approvalRequired: true, workflowVersion: 1, sortOrder: 0 }],
  fieldDefinitions: [{ id: "fd-1", groupId: "g-1", key: "fuel", name: "연료", type: "select", required: false, config: { options: ["가솔린", "디젤", "하이브리드"] }, sortOrder: 0 }],
  products: [{ id: "p-1", groupId: "g-1", name: "아반떼 01", identifier: "12가 3456", status: "rented", fields: {} }, { id: "p-2", groupId: "g-1", name: "아반떼 02", identifier: "38나 9210", status: "available", fields: {} }, { id: "p-3", groupId: "g-2", name: "K5 03", identifier: "61다 7742", status: "reserved", fields: {} }, { id: "p-4", groupId: "g-3", name: "투싼 02", identifier: "24라 1185", status: "rented", fields: {} }],
  workflow,
  bookings: [{ id: "b-1", productId: "p-1", referenceCode: "R-2401", customerName: "김민준", customerPhone: "010-1234-5678", startAt: "2026-08-25T09:00:00+09:00", endAt: "2026-08-27T18:00:00+09:00", approvalStatus: "approved", rentalStatus: "checked_out", workflowVersion: 1, workflowSnapshot: bookingAWorkflow, notificationsEnabled: true }, { id: "b-2", productId: "p-3", referenceCode: "R-2408", customerName: "박서연", customerPhone: "010-7777-2103", startAt: "2026-08-25T13:30:00+09:00", endAt: "2026-08-26T18:00:00+09:00", approvalStatus: "pending", rentalStatus: "reserved", workflowVersion: 1, workflowSnapshot: bookingBWorkflow, notificationsEnabled: true }, { id: "b-3", productId: "p-4", referenceCode: "R-2392", customerName: "최도윤", customerPhone: "010-9982-4221", startAt: "2026-08-23T10:00:00+09:00", endAt: "2026-08-25T18:00:00+09:00", approvalStatus: "approved", rentalStatus: "checked_out", workflowVersion: 1, workflowSnapshot: bookingCWorkflow, notificationsEnabled: true }],
  stepRuns: [...makeRuns("b-1", bookingAWorkflow, ["completed", "open", "locked"]), ...makeRuns("b-2", bookingBWorkflow), ...makeRuns("b-3", bookingCWorkflow, ["completed", "completed", "open"])],
  itemRecords: [],
  issues: [{ id: "issue-1", bookingId: "b-3", productId: "p-4", type: "반납 지연", note: "예정 시간 초과", status: "open" }],
};
