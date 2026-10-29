import { interpolate, isLocale, lookupMessage, resolveLocale, translate, translatePlural } from "./core.ts";
import type { Locale, MessageKey, PluralKey } from "./types.ts";
import { getTimeZone } from "../region.ts";

export { dictionaries, matchLocale, resolveLocale, translate, translatePlural, isLocale } from "./core.ts";
export { locales, pluralKeys } from "./types.ts";
export type { Dictionary, Locale, MessageKey, PluralKey } from "./types.ts";

/** 저장된 언어 선택. 값이 없으면 기기 언어를 따른다. */
export const LOCALE_STORAGE_KEY = "rentalflow.locale";
export type LocalePreference = "system" | Locale;

function browserLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? [...navigator.languages] : [navigator.language];
}

// 네이티브(Android)가 알려준 기기 언어. "시스템 기본"일 때의 기준이다.
// Android WebView 의 navigator.language 는 앱별 언어를 따라갈 수 있어 기기 언어의 근거로 쓰지 않는다.
let nativeLanguages: string[] | null = null;

function deviceLanguages(): string[] {
  return nativeLanguages ?? browserLanguages();
}

function readStored(): string | null {
  try { return localStorage.getItem(LOCALE_STORAGE_KEY); } catch { return null; }
}

function resolvePreference(preference: LocalePreference): Locale {
  return preference === "system" ? resolveLocale(null, deviceLanguages()) : preference;
}

/** 화면이 구독하는 값. 로케일과 선택(시스템/한국어/English)을 함께 담아 선택 변경도 다시 그린다. */
type LocaleSnapshot = { locale: Locale; preference: LocalePreference };

// 저장에 실패해도 이번 실행 동안은 메모리 값을 우선한다.
let snapshot: LocaleSnapshot = (() => {
  const stored = readStored();
  const preference: LocalePreference = isLocale(stored) ? stored : "system";
  return { locale: resolvePreference(preference), preference };
})();
const listeners = new Set<() => void>();

function applyDocumentLang() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = snapshot.locale;
  document.documentElement.dir = "ltr";
}

applyDocumentLang();

// 시스템 기본일 때 기기 언어가 바뀌면 따라간다.
if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (snapshot.preference === "system") apply({ preference: "system" });
  });
}

export function getLocale(): Locale {
  return snapshot.locale;
}

export function localePreference(): LocalePreference {
  return snapshot.preference;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function apply(next: { preference: LocalePreference; locale?: Locale }) {
  const locale = next.locale ?? resolvePreference(next.preference);
  if (locale === snapshot.locale && next.preference === snapshot.preference) return;
  snapshot = { locale, preference: next.preference };
  applyDocumentLang();
  for (const listener of listeners) listener();
}

/** Android 처럼 navigator.language 가 앱별 언어를 따라가는 환경에서 진짜 기기 언어를 알려준다. */
export function setDeviceLanguages(languages: readonly string[]): void {
  const next = languages.filter(language => language.trim().length > 0);
  if (!next.length) return;
  nativeLanguages = next;
  // 시스템 기본을 쓰는 중이라면 기준이 바뀌었으므로 다시 고른다.
  if (snapshot.preference === "system") apply({ preference: "system" });
}

/** 언어 저장 → 현재 로케일 교체 → html lang 갱신 → 구독자 통지. 재시작이 필요 없다. */
export function setLocale(next: LocalePreference): Locale {
  try {
    if (next === "system") localStorage.removeItem(LOCALE_STORAGE_KEY);
    else localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch { /* 저장하지 못해도 이번 실행에는 적용한다. */ }
  apply({ preference: next });
  return snapshot.locale;
}

export function t(key: MessageKey, params?: Record<string, unknown>): string {
  return translate(snapshot.locale, key, params);
}

export function tp(key: PluralKey, count: number, params?: Record<string, unknown>): string {
  return translatePlural(snapshot.locale, key, count, params);
}

/**
 * 오류 문구를 화면 언어로 옮긴다. 도메인·서버 오류는 `errors.foo` 키로 던지고
 * 값이 필요한 경우 `errors.foo|값|값` 처럼 덧붙인다. 사전에 없는 문구는 그대로 보여준다.
 */
export function tt(message: string): string {
  if (!message) return message;
  const [key, ...values] = message.split("|");
  const template = lookupMessage(snapshot.locale, key);
  if (template === undefined) return message;
  return interpolate(template, Object.fromEntries(values.map((value, index) => [String(index), value])));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(snapshot.locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatPrice(value: number): string {
  return t("format.price", { amount: formatNumber(value) });
}

export function formatDate(value: Date | string, options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", weekday: "long" }): string {
  return new Intl.DateTimeFormat(snapshot.locale, { timeZone: getTimeZone(), ...options }).format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat(snapshot.locale, { timeZone: getTimeZone(), hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(snapshot.locale, { timeZone: getTimeZone(), month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

/** 다른 날짜의 일정도 함께 보이는 곳(예약 상세): 월(짧게)·일·시각. */
export function formatShortDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(snapshot.locale, { timeZone: getTimeZone(), month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat(snapshot.locale, { timeZone: getTimeZone(), year: "numeric", month: "long" }).format(value);
}

export function formatWeekdayShort(value: Date): string {
  return new Intl.DateTimeFormat(snapshot.locale, { timeZone: getTimeZone(), weekday: "short" }).format(value);
}

export function formatFullDate(value: Date): string {
  return new Intl.DateTimeFormat(snapshot.locale, { timeZone: getTimeZone(), dateStyle: "full" }).format(value);
}

/** 일정 구분(내부 값 pickup/return)을 화면 문구로 바꿀 때 쓴다. */
export function scheduleLabel(label: "pickup" | "return"): string {
  return t(label === "pickup" ? "schedule.pickup" : "schedule.return");
}

/** 정책 문서 링크. 영어 화면은 영어본으로 보낸다(국문본이 정본). */
export function policyHref(kind: "terms" | "privacy"): string {
  return getLocale() === "ko" ? `/${kind}.html` : `/en/${kind}.html`;
}
