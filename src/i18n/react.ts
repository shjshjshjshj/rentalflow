import { useSyncExternalStore } from "react";
import { getLocale, setLocale, subscribe, localePreference, type Locale, type LocalePreference } from "./index.ts";

/** 현재 언어를 구독한다. 언어가 바뀌면 이 훅을 쓴 컴포넌트가 다시 그려진다(재마운트 없음). */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** 저장된 선택(시스템 기본/한국어/English). 같은 로케일이어도 선택이 바뀌면 다시 그려야 한다. */
export function useLocalePreference(): LocalePreference {
  return useSyncExternalStore(subscribe, localePreference, localePreference);
}

export { getLocale, setLocale, localePreference };
export type { Locale, LocalePreference };
