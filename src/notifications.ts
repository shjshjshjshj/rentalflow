import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { t } from "./i18n/index.ts";
import type { RentalData } from "./model";
import { reminderText, reminderTimes, type Reminder } from "./reminders.ts";

// 예약 시각을 OS 알람으로 넘겨 앱이 닫혀 있어도 알림이 뜨게 한다. 문구는 앱이 만든다.
const storageKey = "rentalflow-notifications";
const channelId = "rental-schedule";
const scheduleLimit = 20;

export function isEnabled(): boolean {
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

function store(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(storageKey, "true");
    else localStorage.removeItem(storageKey);
  } catch {
    /* 저장하지 못해도 이번 실행에는 적용한다. */
  }
}

export async function ensurePermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === "granted";
}

/** 권한을 받은 뒤 저장하고, 지금 데이터로 알람을 건다. 권한을 거부하면 꺼진 상태로 남는다. */
export async function setEnabled(enabled: boolean, data: RentalData): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const granted = enabled ? await ensurePermission() : false;
  const next = enabled && granted;
  store(next);
  await syncReminders(data);
  return next;
}

export async function cancelReminders() {
  if (!Capacitor.isNativePlatform()) return;
  try { await clearScheduled(); } catch { /* 지우지 못해도 화면 동작을 막지 않는다. */ }
}

async function clearScheduled() {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) });
}

/**
 * 앱이 열려 있는 동안 계산한 일정을 통째로 다시 건다.
 * 앱을 다시 열 때마다 호출되므로 재부팅으로 사라진 알람도 이때 복구된다.
 */
export async function syncReminders(data: RentalData) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await clearScheduled();
    if (!isEnabled()) return;
    const reminders = reminderTimes(data).slice(0, scheduleLimit);
    if (!reminders.length) return;
    await LocalNotifications.createChannel({ id: channelId, name: t("notify.channelName"), description: t("notify.channelDescription"), importance: 4, visibility: 1, vibration: true });
    await LocalNotifications.schedule({
      notifications: reminders.map((reminder, index) => {
        const text = reminderText(reminder);
        return { id: index + 1, title: text.title, body: text.body, channelId, schedule: { at: new Date(reminder.at), allowWhileIdle: true }, extra: { bookingId: reminder.bookingId, key: reminder.key } };
      }),
    });
  } catch {
    /* 알림을 걸지 못해도 앱 화면 동작을 막지 않는다. */
  }
}

/** 지금 켜져 있는지 확인하는 용도의 즉시 알림. 5초 뒤에 뜬다. */
export async function sendTest() {
  if (!Capacitor.isNativePlatform()) throw new Error("errors.notifyAndroidOnly");
  if (!(await ensurePermission())) throw new Error("errors.notifyPermission");
  await LocalNotifications.createChannel({ id: channelId, name: t("notify.channelName"), description: t("notify.channelDescription"), importance: 4, visibility: 1, vibration: true });
  const reminder: Reminder = { key: "test", bookingId: "", kind: "rental", at: Date.now() + 5000, product: t("common.item") };
  const text = reminderText(reminder);
  await LocalNotifications.schedule({ notifications: [{ id: 9999, title: text.title, body: text.body, channelId, schedule: { at: new Date(reminder.at), allowWhileIdle: true } }] });
}

/** 알림을 누르면 예약 상세로 들어간다. 위젯과 같은 방식이다. */
export async function initializeNotificationTap(onBooking: (bookingId: string) => void) {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const listener = await LocalNotifications.addListener("localNotificationActionPerformed", event => {
    const bookingId = event.notification.extra?.bookingId;
    if (typeof bookingId === "string" && bookingId) onBooking(bookingId);
  });
  return () => void listener.remove();
}

