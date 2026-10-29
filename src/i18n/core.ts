import { en } from "./en.ts";
import { ko } from "./ko.ts";
import { id } from "./id.ts";
import { vi } from "./vi.ts";
import { th } from "./th.ts";
import { ms } from "./ms.ts";
import { locales, type Dictionary, type Locale, type MessageKey, type PluralKey } from "./types.ts";

// 사전 조회, 폴백, 복수형 선택, 언어 결정. React 나 DOM 없이 동작해야 한다.
export const dictionaries: Record<Locale, Dictionary> = { ko, en, id, vi, th, ms };

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale);
}

/** 기기 언어 목록에서 지원하는 첫 언어를 고른다. 없으면 null. */
export function matchLocale(languages: readonly string[]): Locale | null {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "in") return "id";
    if (isLocale(base)) return base;
  }
  return null;
}

/** 저장된 선택 → 기기 언어 → en 순서. */
export function resolveLocale(stored: string | null | undefined, deviceLanguages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  return matchLocale(deviceLanguages) ?? "en";
}

const placeholder = /\{(\w+)\}/g;

export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(placeholder, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** 런타임 폴백 조회. 사전에 없는 키는 undefined. 키 타입은 호출부에서 좁힌다. */
export function lookupMessage(locale: Locale, key: string): string | undefined {
  return dictionaries[locale][key] ?? dictionaries.ko[key];
}

/** 공개 API는 MessageKey 로 제한한다(오타는 빌드에서 잡힌다). 없는 키는 런타임에 키 자체를 돌려준다. */
export function translate(locale: Locale, key: MessageKey, params?: Record<string, unknown>): string {
  const template = lookupMessage(locale, key);
  return template === undefined ? key : interpolate(template, params);
}

export function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(locale).select(count);
}

/** `key.one` / `key.other` 처럼 범주 접미사가 붙은 키를 고른다. 없으면 기준 언어로 폴백한다. */
export function translatePlural(locale: Locale, key: PluralKey, count: number, params: Record<string, unknown> = {}): string {
  const values = { count, ...params };
  const specific = `${key}.${pluralCategory(locale, count)}`;
  const template = lookupMessage(locale, specific) ?? lookupMessage(locale, key);
  return template === undefined ? key : interpolate(template, values);
}
