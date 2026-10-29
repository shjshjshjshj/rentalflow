import { App as NativeApp } from "@capacitor/app";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { localePreference, matchLocale, setDeviceLanguages, setLocale, subscribe, type Locale, type LocalePreference } from "./i18n";

// Android 앱별 언어(API 33+). 앱에서 고른 언어와 OS 설정의 앱 언어를 같은 값으로 맞춘다.
const RentalLocale = registerPlugin<{
  getAppLocale(): Promise<{ tag: string | null; system: string; supported?: boolean }>;
  setAppLocale(options: { preference: string }): Promise<void>;
  addListener(eventName: "localeChanged", listenerFunc: (data: { tag: string | null; system: string }) => void): Promise<PluginListenerHandle>;
}>("RentalLocale");

const isAndroid = () => Capacitor.getPlatform() === "android";

// 마지막으로 OS 에 밀어 넣은 값. 같은 값을 반복해서 쓰지 않는다.
let pushed: LocalePreference | null = null;

function pushOnce(preference: LocalePreference) {
  if (preference === pushed) return;
  pushed = preference;
  void pushLocaleToNative(preference);
}

function supported(tag: string | null | undefined): Locale | null {
  return tag ? matchLocale([tag]) : null;
}

/**
 * 앱에서 고른 언어를 OS 앱별 언어에 반영한다. system 이면 override 를 지워 기기 언어를 따른다.
 *
 * manifest 의 configChanges 에 locale 이 있어 구성 변경만 일어나고 activity 는 다시 만들어지지 않는다.
 * Capacitor 는 구성 변경 때 WebView 를 다시 불러오지 않으므로(Bridge.onConfigurationChanged 는 plugin 에만
 * 알린다) 화면에 보이는 동안 불러도 작성 중이던 입력이 남는다.
 */
export async function pushLocaleToNative(preference: LocalePreference) {
  if (!isAndroid()) return;
  try { await RentalLocale.setAppLocale({ preference }); }
  catch { /* OS 반영에 실패해도 앱 화면은 그대로 동작한다. */ }
}

/**
 * OS 앱별 언어가 있으면 그 값이 우선이다(사용자가 OS 설정에서 바꾼 경우).
 * 없으면 시스템 기본으로 두고, 기기 언어는 네이티브가 알려준 값을 쓴다.
 */
export async function adoptNativeLocale() {
  if (!isAndroid()) return;
  try {
    const { tag, system, supported: nativeSupported } = await RentalLocale.getAppLocale();
    setDeviceLanguages([system]);
    if (nativeSupported === false) return;
    const next: LocalePreference = supported(tag) ?? "system";
    // OS 가 이미 이 값이므로 다시 밀어 넣지 않는다.
    pushed = next;
    if (next !== localePreference()) setLocale(next);
  } catch { /* 플러그인이 없으면 웹 규칙(저장값 → 기기 언어)을 그대로 쓴다. */ }
}

/**
 * 부팅 시 한 번: OS 값을 읽어 반영하고, 이후 앱 선택이 바뀌면 곧바로 OS 로 밀어 넣는다.
 * OS 설정에서 바꾼 값은 구성 변경 알림과 앱 재활성화 두 경로로 다시 읽는다.
 */
export async function initializeLocaleSync() {
  if (!isAndroid()) return () => undefined;
  await adoptNativeLocale();
  const unsubscribe = subscribe(() => pushOnce(localePreference()));
  void RentalLocale.addListener("localeChanged", () => { void adoptNativeLocale(); }).catch(() => undefined);
  const listener = await NativeApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void adoptNativeLocale();
    else pushOnce(localePreference());
  });
  return () => { unsubscribe(); void listener.remove(); };
}
