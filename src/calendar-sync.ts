import { Capacitor, registerPlugin } from "@capacitor/core";
import type { RentalData } from "./model";

export interface CalendarState { calendarId: string; enabled: boolean; permission: boolean; calendarName?: string }
export interface CalendarOption { id: string; name: string; account: string }
export interface CalendarEntry { id: string; title: string; start: number; end: number }
export interface CalendarSyncResult { inserted: number; updated: number; deleted: number; failed: number }

interface RentalCalendarPlugin {
  getState(options: { workspaceKey: string }): Promise<CalendarState>;
  listCalendars(): Promise<{ calendars: CalendarOption[] }>;
  configure(options: { workspaceKey: string; calendarId: string; enabled: boolean; bookingIds: string[] }): Promise<CalendarState>;
  sync(options: { workspaceKey: string; entries: CalendarEntry[]; bookingIds: string[]; includeExisting: boolean }): Promise<CalendarSyncResult>;
}

const RentalCalendar = registerPlugin<RentalCalendarPlugin>("RentalCalendar");
const EMPTY_STATE: CalendarState = { calendarId: "", enabled: false, permission: false };
const EMPTY_RESULT: CalendarSyncResult = { inserted: 0, updated: 0, deleted: 0, failed: 0 };
const ERROR_PREFIX = "rentalflow.calendarError.";
const memoryErrors = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
let activeWorkspaceKey = "";

function canUseCalendar(data: Pick<RentalData, "ownerId" | "workspaceId">): boolean {
  return Capacitor.getPlatform() === "android" && Boolean(data.ownerId) && Boolean(data.workspaceId);
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

export function calendarWorkspaceKey(data: Pick<RentalData, "ownerId" | "workspaceId">): string {
  return JSON.stringify([data.ownerId, data.workspaceId]);
}

export function setCalendarContext(data: Pick<RentalData, "ownerId" | "workspaceId"> | null): void {
  activeWorkspaceKey = data ? calendarWorkspaceKey(data) : "";
}

function storageKey(data: Pick<RentalData, "ownerId" | "workspaceId">): string {
  return ERROR_PREFIX + calendarWorkspaceKey(data);
}

function readStoredError(data: Pick<RentalData, "ownerId" | "workspaceId">): string {
  const key = storageKey(data);
  if (memoryErrors.has(key)) return memoryErrors.get(key) ?? "";
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function storeError(data: Pick<RentalData, "ownerId" | "workspaceId">, message: string): void {
  const key = storageKey(data);
  if (message) memoryErrors.set(key, message); else memoryErrors.delete(key);
  try {
    if (message) localStorage.setItem(key, message);
    else localStorage.removeItem(key);
  } catch {
    // 저장소를 쓸 수 없어도 메모리 기록은 유지한다.
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : typeof error === "string" ? error : "";
  return message.startsWith("errors.") ? message : "errors.calendarSync";
}

export function calendarEntries(data: RentalData): CalendarEntry[] {
  const products = new Map(data.products.map(product => [product.id, product.name] as const));
  return data.bookings.flatMap((booking): CalendarEntry[] => {
    if (booking.rentalStatus === "cancelled" || booking.approvalStatus === "rejected") return [];
    const start = new Date(booking.startAt).getTime();
    const end = new Date(booking.endAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const productName = products.get(booking.productId) ?? "Rental Flow";
    return [{ id: booking.id, title: `Rental Flow · ${productName} · ${booking.referenceCode}`, start, end }];
  });
}

export async function getCalendarState(data: RentalData): Promise<CalendarState> {
  if (!canUseCalendar(data)) return { ...EMPTY_STATE };
  try {
    return await RentalCalendar.getState({ workspaceKey: calendarWorkspaceKey(data) });
  } catch (error) {
    storeError(data, errorMessage(error));
    return { ...EMPTY_STATE };
  }
}

export async function listDeviceCalendars(): Promise<CalendarOption[]> {
  if (Capacitor.getPlatform() !== "android") return [];
  const result = await RentalCalendar.listCalendars();
  return result.calendars.filter(calendar => Boolean(calendar.id));
}

export function configureCalendar(data: RentalData, calendarId: string, enabled: boolean): Promise<CalendarState> {
  if (!canUseCalendar(data)) return Promise.resolve({ ...EMPTY_STATE });
  return enqueue(async () => {
    try {
      const state = await RentalCalendar.configure({
        workspaceKey: calendarWorkspaceKey(data),
        calendarId,
        enabled,
        bookingIds: data.bookings.map(booking => booking.id)
      });
      storeError(data, "");
      return state;
    } catch (error) {
      const message = errorMessage(error);
      storeError(data, message);
      throw new Error(message);
    }
  });
}

export function syncCalendar(data: RentalData, includeExisting = false): Promise<CalendarSyncResult> {
  if (!canUseCalendar(data)) return Promise.resolve({ ...EMPTY_RESULT });
  return enqueue(async () => {
    try {
      if (!includeExisting && activeWorkspaceKey !== calendarWorkspaceKey(data)) return { ...EMPTY_RESULT };
      const result = await RentalCalendar.sync({
        workspaceKey: calendarWorkspaceKey(data),
        entries: calendarEntries(data),
        bookingIds: data.bookings.map(booking => booking.id),
        includeExisting
      });
      storeError(data, result.failed > 0 ? "errors.calendarSync" : "");
      return result;
    } catch (error) {
      const message = errorMessage(error);
      storeError(data, message);
      throw new Error(message);
    }
  });
}

export function getCalendarError(data: RentalData): string {
  if (!canUseCalendar(data)) return "";
  return readStoredError(data);
}
