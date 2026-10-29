import type { ko } from "./ko.ts";

/** 기준 사전(ko)에서 파생한 키 타입. 오타는 컴파일에서 잡힌다. */
export type MessageKey = keyof typeof ko;

/**
 * 복수형을 쓰는 키. Intl.PluralRules 범주에 따라 `키.one` / `키.other` 를 조회한다.
 * 목록이 기준 사전의 `.other` 키와 일치하는지는 check(i18n.test)가 확인한다.
 */
export const pluralKeys = [
  "home.greeting2",
  "calendar.dayCount",
  "calendar.contracts",
  "work.completed",
  "work.pending",
  "inventory.count",
  "detail.openIssues",
  "procedure.version",
  "groupDetail.steps",
  "groupDetail.fieldsCount",
  "builder.reviewItems",
  "onboarding.ready.benefit2Hint",
] as const;
export type PluralKey = (typeof pluralKeys)[number];

export type Locale = "ko" | "en" | "id" | "vi" | "th" | "ms";

export const locales: readonly Locale[] = ["ko", "en", "id", "vi", "th", "ms"];

/** 기준 키를 모두 담되 복수형(.one/.other) 같은 추가 키도 허용한다. */
export type Dictionary = Record<MessageKey, string> & Record<string, string>;
