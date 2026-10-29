import { confirmRentalEvent, finishRun, hasPendingInspection } from "./domain.ts";
import { t } from "./i18n/index.ts";
import { loadWorkspace, saveWorkspace } from "./local-store.ts";
import type { Booking, BookingDraft, Issue, OnboardingSetup, Product, ProductDraft, ProductFieldDefinition, RentalData, WorkflowOutcome, WorkflowStep, WorkflowStepDraft } from "./model";
import { makeTemplateWorkflow } from "./workflow-templates.ts";

import { canonicalTimeZone, deviceTimeZone, validTimeZone } from "./region.ts";


const id = () => crypto.randomUUID();
const clone = <T,>(value: T): T => structuredClone(value);

/** 단계가 늘어난 뒤에도 기록 항목이 빠지지 않게 맞춘다. 저장 직전과 읽기 직후에 모두 적용해도 안전하다. */
export function withRecords(data: RentalData): RentalData {
  const records = [...data.itemRecords];
  for (const run of data.stepRuns) for (const item of run.stepSnapshot.items) {
    if (!records.some(record => record.stepRunId === run.id && record.itemSnapshot.id === item.id)) records.push({ id: id(), stepRunId: run.id, itemSnapshot: clone(item), sortOrder: item.sortOrder, status: run.status === "completed" ? "completed" : "pending" });
  }
  return { ...data, itemRecords: records };
}

function emptyWorkspace(ownerId: string): RentalData {
  return { workspaceId: id(), ownerId, workspaceName: t("workspace.defaultName"), timeZone: deviceTimeZone(), plan: "free", onboardingCompleted: false, termsAccepted: false, privacyAccepted: false, categories: [], groups: [], fieldDefinitions: [], products: [], workflow: [], bookings: [], stepRuns: [], itemRecords: [], issues: [] };
}

/** 첫 실행이면 빈 워크스페이스를 만들어 저장한다. 이후 모든 조작은 이 값을 기준으로 한다. */
let activeOwner = "";

export async function loadRentalData(ownerId: string): Promise<RentalData> {
  activeOwner = ownerId;
  const stored = await loadWorkspace(ownerId);
  if (stored) return withRecords(stored);
  const fresh = emptyWorkspace(ownerId);
  await saveWorkspace(fresh);
  return fresh;
}

/**
 * 모든 로컬 쓰기는 여기를 지난다: 읽고 → 검증하고 → 통째로 저장한다.
 * 서버가 DB 제약으로 지키던 규칙이 이제 여기에만 있으므로, 화면별로 검사를 복제하지 않는다.
 */
let writeQueue: Promise<void> = Promise.resolve();
function update(mutate: (data: RentalData) => RentalData | null, ownerId = activeOwner): Promise<void> {
  const operation = writeQueue.then(async () => {
    const data = await loadWorkspace(ownerId);
    if (!data) throw new Error("errors.storedData");
    const next = mutate(data);
    if (next) await saveWorkspace(withRecords({ ...next, ownerId }));
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export const replaceWorkspace = (workspace: RentalData, ownerId: string) => update(() => workspace, ownerId);
export const saveRegion = (timeZone: string) => update(data => {
  if (!validTimeZone(timeZone)) throw new Error("errors.timeZone");
  return { ...data, timeZone: canonicalTimeZone(timeZone) };
});

export async function acceptPolicies() {
  await update(data => ({ ...data, termsAccepted: true, privacyAccepted: true }));
}

/** 온보딩 결과가 비면 아무것도 없는 사업장이 만들어진다. 서버가 검증하던 자리를 여기서 지킨다. */
export function validateOnboarding(setup: OnboardingSetup) {
  if (!setup.categoryName.trim() || !setup.groupName.trim() || !setup.productName.trim()) throw new Error("errors.onboardingIncomplete");
}

export async function finishOnboardingSetup(setup: OnboardingSetup) {
  await update(data => {
    validateOnboarding(setup);
    const categoryId = id();
    const groupId = id();
    const stepIds = setup.workflow.map(() => id());
    const workflow: WorkflowStep[] = setup.workflow.map((draft, index) => ({ ...draft, id: stepIds[index], groupId, sortOrder: index, items: draft.items.map((item, order) => ({ ...item, id: id(), stepId: stepIds[index], sortOrder: order })) }));
    const fields: ProductFieldDefinition[] = setup.fields.map((field, index) => ({ id: id(), groupId, key: field.key, name: field.name, type: field.type, required: field.required, config: field.options ? { options: field.options } : {}, sortOrder: index }));
    const product: Product = { id: id(), groupId, name: setup.productName.trim(), identifier: setup.identifier.trim(), status: "available", fields: setup.productFields };
    return { ...data, onboardingCompleted: true, categories: [...data.categories, { id: categoryId, name: setup.categoryName.trim(), sortOrder: 0 }], groups: [...data.groups, { id: groupId, categoryId, name: setup.groupName.trim(), approvalRequired: true, workflowVersion: 1, sortOrder: 0 }], fieldDefinitions: [...data.fieldDefinitions, ...fields], products: [...data.products, product], workflow: [...data.workflow, ...workflow] };
  });
}

export async function addGroup(categoryId: string | null, categoryName: string, groupName: string, templateId = "custom") {
  await update(data => {
    const name = groupName.trim();
    if (!name) return null;
    const categories = categoryId ? data.categories : [...data.categories, { id: id(), name: categoryName.trim(), sortOrder: data.categories.length }];
    const parentId = categoryId || categories[categories.length - 1].id;
    if (data.groups.some(group => group.categoryId === parentId && group.name === name)) throw new Error("errors.groupExists");
    const group = { id: id(), categoryId: parentId, name, approvalRequired: true, workflowVersion: 1, sortOrder: data.groups.filter(item => item.categoryId === parentId).length };
    return { ...data, categories, groups: [...data.groups, group], workflow: [...data.workflow, ...(templateId === "blank" ? [] : makeTemplateWorkflow(group.id, templateId))] };
  });
}

export async function saveProduct(draft: ProductDraft) {
  await update(data => {
    const product: Product = { id: draft.id || id(), groupId: draft.groupId, name: draft.name.trim(), identifier: draft.identifier.trim(), status: draft.status, fields: draft.fields || {} };
    return { ...data, products: draft.id ? data.products.map(item => item.id === draft.id ? product : item) : [...data.products, product] };
  });
}

export async function deleteProduct(productId: string) {
  await update(data => {
    if (data.bookings.some(item => item.productId === productId)) throw new Error("errors.bookingHasHistory");
    return { ...data, products: data.products.filter(item => item.id !== productId) };
  });
}

export async function saveWorkflowStep(draft: WorkflowStepDraft) {
  await update(data => {
    const stepId = draft.id || id();
    const current = data.workflow.find(item => item.id === draft.id);
    const sortOrder = current?.sortOrder ?? data.workflow.filter(item => item.groupId === draft.groupId && item.triggerType === draft.triggerType).length;
    const step: WorkflowStep = { ...draft, id: stepId, sortOrder, items: draft.items.map((item, index) => ({ ...item, id: item.id || id(), stepId, sortOrder: index })) };
    return { ...data, groups: data.groups.map(group => group.id === draft.groupId ? { ...group, workflowVersion: group.workflowVersion + 1 } : group), workflow: current ? data.workflow.map(item => item.id === current.id ? step : item) : [...data.workflow, step] };
  });
}

export async function deleteWorkflowStep(step: WorkflowStep) {
  await update(data => ({ ...data, groups: data.groups.map(group => group.id === step.groupId ? { ...group, workflowVersion: group.workflowVersion + 1 } : group), workflow: data.workflow.filter(item => item.id !== step.id) }));
}

export async function reorderWorkflowSteps(groupId: string, triggerType: WorkflowStep["triggerType"], orderedIds: string[]) {
  await update(data => {
    const rows = data.workflow.filter(item => item.groupId === groupId && item.triggerType === triggerType);
    if (rows.length !== orderedIds.length || rows.some(row => !orderedIds.includes(row.id))) throw new Error("errors.staleWorkflow");
    return { ...data, workflow: data.workflow.map(item => { const index = orderedIds.indexOf(item.id); return index < 0 ? item : { ...item, sortOrder: index }; }) };
  });
}

export async function saveFieldDefinition(field: Omit<ProductFieldDefinition, "id"> & { id?: string }) {
  await update(data => {
    const next: ProductFieldDefinition = { ...field, id: field.id || id(), name: field.name.trim() };
    return { ...data, fieldDefinitions: field.id ? data.fieldDefinitions.map(item => item.id === field.id ? next : item) : [...data.fieldDefinitions, next] };
  });
}

export async function deleteFieldDefinition(fieldId: string) {
  await update(data => ({ ...data, fieldDefinitions: data.fieldDefinitions.filter(item => item.id !== fieldId) }));
}

/**
 * 예약 초안의 규칙. 서버가 DB 제약과 RPC 로 지키던 것을 이 함수 하나가 맡는다.
 * 로컬 저장소는 순수 함수가 아니므로, 검증만 따로 떼어 두어야 테스트할 수 있다.
 */
export function validateBooking(data: RentalData, draft: BookingDraft) {
  const existing = data.bookings.find(item => item.id === draft.id);
  if (existing?.rentalStatus === "cancelled") throw new Error("errors.cancelledBooking");
  if (draft.price !== undefined && (!Number.isFinite(draft.price) || draft.price < 0)) throw new Error("errors.invalidPrice");
  if (existing && existing.rentalStatus !== "reserved" && (draft.productId !== existing.productId || +new Date(draft.startAt) !== +new Date(existing.startAt))) throw new Error("errors.rentalLocked");
  if (existing?.rentalStatus === "returned" && +new Date(draft.endAt) !== +new Date(existing.endAt)) throw new Error("errors.returnedLocked");
  if (existing && data.products.find(item => item.id === existing.productId)?.groupId !== data.products.find(item => item.id === draft.productId)?.groupId) throw new Error("errors.groupChange");
  if (Number.isNaN(+new Date(draft.startAt)) || Number.isNaN(+new Date(draft.endAt)) || new Date(draft.endAt) <= new Date(draft.startAt)) throw new Error("errors.endBeforeStart");
  const conflict = data.bookings.find(item => item.id !== draft.id && item.productId === draft.productId && !["cancelled", "returned"].includes(item.rentalStatus) && new Date(item.startAt) < new Date(draft.endAt) && new Date(item.endAt) > new Date(draft.startAt));
  if (conflict && existing?.rentalStatus !== "returned") throw new Error("errors.bookingConflict|" + conflict.referenceCode);
}

export async function saveBooking(draft: BookingDraft) {
  await update(data => {
    validateBooking(data, draft);
    const product = data.products.find(item => item.id === draft.productId);
    const group = data.groups.find(item => item.id === product?.groupId);
    if (!product || !group) throw new Error("errors.groupMissing");
    if (draft.id) return { ...data, bookings: data.bookings.map(item => item.id === draft.id ? { ...item, ...draft } as Booking : item) };
    const workflowSnapshot = clone(data.workflow.filter(item => item.groupId === group.id));
    const booking: Booking = { ...draft, id: id(), referenceCode: "R-" + String(Date.now()).slice(-6), approvalStatus: group.approvalRequired ? "pending" : "not_required", rentalStatus: "reserved", workflowVersion: group.workflowVersion, workflowSnapshot };
    const runs = workflowSnapshot.map(step => ({ id: id(), bookingId: booking.id, sourceStepId: step.id, stepSnapshot: clone(step), triggerType: step.triggerType, sortOrder: step.sortOrder, status: step.triggerType === "booking_confirmed" && !workflowSnapshot.some(other => other.triggerType === step.triggerType && other.sortOrder < step.sortOrder) ? "open" as const : "locked" as const }));
    return { ...data, bookings: [...data.bookings, booking], stepRuns: [...data.stepRuns, ...runs] };
  });
}

export async function cancelBooking(bookingId: string) {
  await update(data => confirmRentalEvent(data, bookingId, "cancel"));
}

export async function applyRentalEvent(bookingId: string, event: "check_out" | "return_received") {
  await update(data => confirmRentalEvent(data, bookingId, event));
}

export async function completeItem(recordId: string, value: unknown) {
  await update(data => ({ ...data, itemRecords: data.itemRecords.map(item => item.id === recordId ? { ...item, status: "completed", value } : item) }));
}

export async function completeRun(runId: string, outcome: WorkflowOutcome) {
  await update(data => finishRun(data, runId, outcome));
}

export async function resolveIssue(issue: Issue, note: string) {
  await update(data => {
    if (data.issues.find(item => item.id === issue.id)?.status === "resolved") return null;
    const hasOtherOpen = data.issues.some(item => item.id !== issue.id && item.productId === issue.productId && item.status === "open");
    const hasActiveBooking = data.bookings.some(item => item.productId === issue.productId && ["checked_out", "returning"].includes(item.rentalStatus));
    return { ...data, issues: data.issues.map(item => item.id === issue.id ? { ...item, status: "resolved" as const, note: note.trim() || item.note } : item), products: data.products.map(item => item.id === issue.productId && item.status !== "unavailable" ? { ...item, status: hasOtherOpen ? "inspection" as const : hasActiveBooking ? "rented" as const : hasPendingInspection(data, issue.productId) ? "inspection" as const : "available" as const } : item) };
  });
}
