import { t } from "./i18n/index.ts";
import type { RentalData } from "./model";

/** 대여·반납 2시간 전. 서버가 만들던 것과 같은 시각이다. */
export const leadMs = 2 * 60 * 60 * 1000;

export type ReminderKind = "rental" | "return";

export type Reminder = { key: string; bookingId: string; kind: ReminderKind; at: number; product: string };

/**
 * 지금 시점에서 앞으로 보낼 알림만 계산한다.
 * 규칙은 기존 푸시와 같다: 대여 2시간 전(예약 상태), 반납 2시간 전(예약·대여 중), 거절·취소·반납 완료는 제외.
 * 이미 지난 시각은 OS 가 즉시 띄우므로 넣지 않는다.
 */
export function reminderTimes(data: RentalData, now = Date.now()): Reminder[] {
  const reminders: Reminder[] = [];
  for (const booking of data.bookings) {
    if (!booking.notificationsEnabled) continue;
    if (booking.approvalStatus === "rejected" || booking.rentalStatus === "cancelled") continue;
    const product = data.products.find(item => item.id === booking.productId)?.name.trim() || t("common.item");
    const rentalAt = +new Date(booking.startAt) - leadMs;
    if (booking.rentalStatus === "reserved" && rentalAt > now) reminders.push({ key: booking.id + ":rental_before", bookingId: booking.id, kind: "rental", at: rentalAt, product });
    const returnAt = +new Date(booking.endAt) - leadMs;
    if (["reserved", "checked_out"].includes(booking.rentalStatus) && returnAt > now) reminders.push({ key: booking.id + ":return_before", bookingId: booking.id, kind: "return", at: returnAt, product });
  }
  return reminders.sort((a, b) => a.at - b.at);
}

/** 안드로이드 알림 문구. 저장된 문구를 번역하지 않고 종류와 상품명으로 만든다. */
export function reminderText(reminder: Reminder): { title: string; body: string } {
  return reminder.kind === "rental"
    ? { title: t("remind.rental.title"), body: t("remind.rental.body", { product: reminder.product }) }
    : { title: t("remind.return.title"), body: t("remind.return.body", { product: reminder.product }) };
}

