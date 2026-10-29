import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import type { RentalData } from "./model";
import { widgetLink, widgetSetup, widgetSnapshot } from "./domain";

// Android home screen widget. The provider renders a local snapshot and never pretends to poll in the background.
const RentalWidget = registerPlugin<{ setSnapshot(options: { snapshot: string; locale?: string }): Promise<void>; clearSnapshot(): Promise<void> }>("RentalWidget");

const isAndroid = () => Capacitor.getPlatform() === "android";

export async function syncRentalWidget(data: RentalData, locale: string) {
  if (!isAndroid()) return;
  // 위젯 문구와 날짜 서식도 앱에서 고른 언어를 따르도록 함께 넘긴다.
  try { await RentalWidget.setSnapshot({ snapshot: JSON.stringify(widgetSnapshot(data)), locale }); }
  catch { /* 위젯을 갱신하지 못해도 앱 화면 동작을 막지 않습니다. */ }
}

/** 아직 기본 설정을 끝내지 않아 보여줄 일정이 없는 상태를 알립니다. */
export async function syncRentalWidgetSetup(locale: string) {
  if (!isAndroid()) return;
  try { await RentalWidget.setSnapshot({ snapshot: JSON.stringify(widgetSetup()), locale }); }
  catch { /* 위와 같습니다. */ }
}

export async function clearRentalWidget() {
  if (!isAndroid()) return;
  try { await RentalWidget.clearSnapshot(); }
  catch { /* 위와 같습니다. */ }
}

export interface WidgetHandlers { onBooking: (bookingId: string) => void; onNewBooking: () => void; onRefresh: () => void }

// Cold starts deliver the launch url, warm starts deliver appUrlOpen, and both can repeat after recreation.
let launchUrlRead = false;
let lastHandled: { url: string; at: number } | null = null;

export async function initializeWidgetNavigation(handlers: WidgetHandlers) {
  if (!isAndroid()) return () => undefined;
  const handle = (raw?: string | null) => {
    if (!raw) return;
    const now = Date.now();
    if (lastHandled && lastHandled.url === raw && now - lastHandled.at < 2000) return;
    lastHandled = { url: raw, at: now };
    const link = widgetLink(raw);
    if (!link) return;
    if (link.type === "booking") handlers.onBooking(link.bookingId);
    else if (link.type === "new-booking") handlers.onNewBooking();
    else handlers.onRefresh();
  };
  if (!launchUrlRead) {
    launchUrlRead = true;
    void NativeApp.getLaunchUrl().then(result => handle(result?.url)).catch(() => undefined);
  }
  const listener = await NativeApp.addListener("appUrlOpen", ({ url }) => handle(url));
  return () => void listener.remove();
}

