import { t, type MessageKey } from "./i18n";


export type ProductStatus = "available" | "reserved" | "rented" | "inspection" | "unavailable";
export type ApprovalStatus = "not_required" | "pending" | "needs_supplement" | "approved" | "rejected";
export type RentalStatus = "reserved" | "checked_out" | "returning" | "returned" | "cancelled";
export type TriggerType = "booking_confirmed" | "rental_minus_2h" | "return_minus_2h" | "manual";
export type CompletionType = "check" | "note" | "number" | "photo" | "signature" | "select";
export type RunStatus = "locked" | "open" | "completed" | "skipped" | "blocked";
export type PlanCode = "free" | "pro";
export type ProductFieldType = "text" | "number" | "date" | "select" | "boolean";

export interface Category { id: string; name: string; sortOrder: number }
export interface ProductGroup { id: string; categoryId: string; name: string; approvalRequired: boolean; workflowVersion: number; sortOrder: number }
export interface Product { id: string; groupId: string; name: string; identifier: string; status: ProductStatus; fields: Record<string, string> }
export interface ProductFieldDefinition { id: string; groupId: string; key: string; name: string; type: ProductFieldType; required: boolean; config: { options?: string[] }; sortOrder: number }
export interface WorkflowItem { id: string; stepId: string; title: string; completionType: CompletionType; required: boolean; config: Record<string, unknown>; sortOrder: number }
export interface WorkflowOutcome { label: string; action: "continue" | "hold_booking" | "cancel_booking" | "make_available" | "create_issue" }
export interface WorkflowStep { id: string; groupId: string; triggerType: TriggerType; name: string; sortOrder: number; resultMode: "simple" | "branch"; outcomes: WorkflowOutcome[]; items: WorkflowItem[] }
export interface Booking { id: string; productId: string; referenceCode: string; customerName: string; customerPhone: string; startAt: string; endAt: string; approvalStatus: ApprovalStatus; rentalStatus: RentalStatus; workflowVersion: number; workflowSnapshot: WorkflowStep[]; notificationsEnabled: boolean; price?: number; memo?: string; checkedOutAt?: string; returnedAt?: string }
export interface StepRun { id: string; bookingId: string; sourceStepId?: string; stepSnapshot: WorkflowStep; triggerType: TriggerType; sortOrder: number; status: RunStatus; outcome?: string }
export interface ItemRecord { id: string; stepRunId: string; itemSnapshot: WorkflowItem; sortOrder: number; status: "pending" | "completed" | "skipped"; value?: unknown }
export interface Issue { id: string; bookingId?: string; productId: string; type: string; note: string; status: "open" | "resolved" }

export interface RentalData {
  workspaceId: string;
  ownerId: string;
  workspaceName: string;
  timeZone?: string;
  plan: PlanCode;
  onboardingCompleted: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  categories: Category[];
  groups: ProductGroup[];
  fieldDefinitions: ProductFieldDefinition[];
  products: Product[];
  workflow: WorkflowStep[];
  bookings: Booking[];
  stepRuns: StepRun[];
  itemRecords: ItemRecord[];
  issues: Issue[];
}

export interface ProductDraft { id?: string; categoryId: string; groupId: string; name: string; identifier: string; status: ProductStatus; fields?: Record<string, string> }
export interface WorkflowStepDraft { id?: string; groupId: string; triggerType: TriggerType; name: string; resultMode: "simple" | "branch"; outcomes: WorkflowOutcome[]; items: Array<Pick<WorkflowItem, "id" | "title" | "completionType" | "required" | "config">> }
export interface BookingDraft { id?: string; productId: string; customerName: string; customerPhone: string; startAt: string; endAt: string; price?: number; memo?: string; notificationsEnabled: boolean }
export interface OnboardingSetup { industry: string; categoryName: string; groupName: string; productName: string; identifier: string; productFields: Record<string, string>; workflow: WorkflowStepDraft[]; fields: Array<{ key: string; name: string; type: ProductFieldType; required: boolean; options?: string[] }> }

// 화면 문구는 사전에서 가져온다. 모듈 로드 시점에 고정하지 않고 조회 시점의 언어를 따른다.
const triggerKeys: Record<TriggerType, MessageKey> = { booking_confirmed: "trigger.booking_confirmed", rental_minus_2h: "trigger.rental_minus_2h", return_minus_2h: "trigger.return_minus_2h", manual: "trigger.manual" };
const statusKeys: Record<ProductStatus, MessageKey> = { available: "status.available", reserved: "status.reserved", rented: "status.rented", inspection: "status.inspection", unavailable: "status.unavailable" };
const approvalKeys: Record<ApprovalStatus, MessageKey> = { not_required: "booking.approval.not_required", pending: "booking.approval.pending", needs_supplement: "booking.approval.needs_supplement", approved: "booking.approval.approved", rejected: "booking.approval.rejected" };
const rentalKeys: Record<RentalStatus, MessageKey> = { reserved: "booking.rental.reserved", checked_out: "booking.rental.checked_out", returning: "booking.rental.returning", returned: "booking.rental.returned", cancelled: "booking.rental.cancelled" };
const recordKeys: Record<CompletionType, MessageKey> = { check: "record.check", note: "record.note", number: "record.number", photo: "record.photo", signature: "record.signature", select: "record.select" };
const fieldTypeKeys: Record<ProductFieldType, MessageKey> = { text: "field.type.text", number: "field.type.number", date: "field.type.date", select: "field.type.select", boolean: "field.type.boolean" };

export const triggerLabel = (trigger: TriggerType) => t(triggerKeys[trigger]);
export const statusLabel = (status: ProductStatus) => t(statusKeys[status]);
export const approvalLabel = (status: ApprovalStatus) => t(approvalKeys[status]);
export const rentalLabel = (status: RentalStatus) => t(rentalKeys[status]);
export const recordLabel = (type: CompletionType) => t(recordKeys[type]);
export const fieldTypeLabel = (type: ProductFieldType) => t(fieldTypeKeys[type]);
