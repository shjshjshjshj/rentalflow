import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dictionaries, resolveLocale, translate, translatePlural } from "./core.ts";
import { id } from "./id.ts";
import { en } from "./en.ts";
import { ko } from "./ko.ts";
import { locales, pluralKeys } from "./types.ts";
import { formatDateTime, formatMonth, formatPrice, formatShortDateTime, formatTime, getLocale, localePreference, setDeviceLanguages, setLocale, subscribe, tt } from "./index.ts";

const koKeys = Object.keys(ko);
const enKeys = new Set(Object.keys(en));

// 1. 기준 언어의 키가 다른 언어에 없으면 실패한다(번역 누락 방지).
const missing = koKeys.filter(key => !enKeys.has(key));
assert.deepEqual(missing, [], `영어 사전에 없는 키: ${missing.join(", ")}`);

// 2. 값이 비어 있으면 실패한다.
for (const [locale, dictionary] of [["ko", ko], ["en", en], ["id", id]] as const) {
  for (const key of Object.keys(dictionary)) assert.ok((dictionary as Record<string, string>)[key]?.trim(), `${locale} 사전의 빈 값: ${key}`);
}

// 3. 플레이스홀더 집합이 언어마다 같아야 한다(값을 채우다 빠뜨리는 실수 방지).
const holes = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(",");
for (const key of koKeys) {
  if (enKeys.has(key)) assert.equal(holes(en[key]), holes(ko[key]), `${key} 플레이스홀더 불일치`);
}

// 4. 복수형 키는 영어에 .one/.other 가 모두 있어야 한다.
const pluralBases = [...new Set(koKeys.filter(key => key.endsWith(".other")).map(key => key.slice(0, -".other".length)))];
assert.deepEqual([...pluralKeys].sort(), [...pluralBases].sort(), "pluralKeys 목록이 사전의 복수형 키와 다르다");
for (const base of pluralBases) {
  assert.ok(enKeys.has(`${base}.other`), `${base}.other 누락`);
  assert.ok(enKeys.has(`${base}.one`), `${base}.one 누락(영어는 단수형이 필요)`);
}

// 5. 코드에서 쓰는 동적 키 가족이 사전에 모두 있어야 한다.
const families: Record<string, readonly string[]> = {
  status: ["available", "reserved", "rented", "inspection", "unavailable"],
  trigger: ["booking_confirmed", "rental_minus_2h", "return_minus_2h", "manual"],
  record: ["check", "note", "number", "photo", "signature", "select"],
  "booking.rental": ["reserved", "checked_out", "returning", "returned", "cancelled"],
  "booking.approval": ["not_required", "pending", "needs_supplement", "approved", "rejected"],
  "field.type": ["text", "number", "date", "select", "boolean"],
};
for (const [prefix, members] of Object.entries(families)) {
  for (const member of members) assert.ok(koKeys.includes(`${prefix}.${member}`), `누락된 키: ${prefix}.${member}`);
}

// 6. 언어 결정 순서: 저장된 선택 → 기기 언어 → ko.
assert.equal(resolveLocale("en", ["ko-KR"]), "en");
assert.equal(resolveLocale(null, ["en-US", "ko-KR"]), "en");
assert.equal(resolveLocale("system", ["en-GB"]), "en");
assert.equal(resolveLocale("fr", ["fr-FR"]), "en");
assert.equal(resolveLocale(null, []), "en");

// 7. 폴백: 없는 키는 기준 언어, 기준에도 없으면 원문을 그대로 둔다.
assert.equal(translate("en", "nav.home"), "Home");
assert.equal(translate("ko", "nav.home"), "홈");

// 8. 복수형: 한국어는 항상 other, 영어는 단수/복수를 나눈다.
assert.equal(translatePlural("ko", "home.greeting2", 1), "1건의 일정");
assert.equal(translatePlural("en", "home.greeting2", 1), "1 schedule");
assert.equal(translatePlural("en", "home.greeting2", 2), "2 schedules");

// 홈 인사말은 조각(greeting1 + 줄바꿈 + greeting2 + greeting3)을 이어 붙이므로 조각 사이 공백까지 확인한다.
const greeting = (locale: "ko" | "en", count: number) => `${translate(locale, "home.greeting1", { name: "A" })}\n${translatePlural(locale, "home.greeting2", count)}${translate(locale, "home.greeting3")}`;
assert.equal(greeting("ko", 2), "A님, 오늘은\n2건의 일정이 있습니다.");
assert.equal(greeting("en", 1), "A, you have\n1 schedule today.", "영어 조각 사이에 공백이 빠지면 여기서 걸린다");
assert.equal(greeting("en", 2), "A, you have\n2 schedules today.");

// 9. 오류 문구: 키와 값으로 넘어온 문구를 현재 언어로 옮기고, 모르는 문구는 그대로 둔다.
setLocale("ko");
assert.equal(tt("errors.bookingConflict|R-1234"), "R-1234 예약과 시간이 겹칩니다.");
assert.equal(tt("errors.requiredItems"), "필수 항목을 먼저 완료해주세요.");
assert.equal(tt("relation \"bookings\" does not exist"), "relation \"bookings\" does not exist");

// 10. 언어 설정 저장·적용: 저장이 안 되는 환경(테스트)에서도 선택은 메모리에 남고,
//     같은 로케일로 바뀌어도 선택이 달라지면 구독자에게 알린다.
let notifications = 0;
const unsubscribe = subscribe(() => { notifications++; });
setLocale("ko");
assert.equal(localePreference(), "ko");
assert.equal(getLocale(), "ko");
const settled = subscriptions();
setLocale("ko");
assert.equal(subscriptions(), settled, "같은 설정을 다시 저장하면 다시 그리지 않는다");
setDeviceLanguages(["fr-FR"]);
setLocale("system");
assert.equal(localePreference(), "system");
assert.equal(getLocale(), "en", "기기 언어가 없으면 en 으로 폴백한다");
assert.ok(subscriptions() > settled, "시스템(한국어) → 한국어처럼 로케일이 같아도 선택이 바뀌면 알린다");
unsubscribe();
function subscriptions() { return notifications; }

// 11. 날짜·숫자 서식: 로케일을 따르고, 예약 상세는 날짜를 잃지 않는다.
const crossingDays = "2026-09-22T09:00:00";
setLocale("ko");
assert.equal(formatTime(crossingDays), "09:00", "일정 목록의 시각에는 날짜가 없다");
assert.ok(formatShortDateTime(crossingDays).includes("09:00") && formatShortDateTime(crossingDays).includes("22"), "예약 상세는 월·일까지 보여준다");
assert.ok(formatDateTime(crossingDays).includes("22"), "캘린더 카드는 월·일·시각을 보여준다");
assert.ok(formatMonth(new Date("2026-09-01T00:00:00")).includes("2026"));
assert.equal(formatPrice(45000), "45,000원");
setLocale("en");
assert.equal(formatPrice(45000), "₩45,000");
assert.ok(formatShortDateTime(crossingDays).includes("Sep"), "영문 월 이름을 쓴다");
assert.ok(formatMonth(new Date("2026-09-01T00:00:00")).startsWith("September"));
setLocale("system");

// 11-1. 네이티브가 알려준 기기 언어: 시스템 기본일 때의 기준이고, 바뀌면 그 자리에서 다시 고른다.
setDeviceLanguages(["ko-KR"]);
assert.equal(getLocale(), "ko");
setDeviceLanguages(["en-US"]);
assert.equal(getLocale(), "en", "기기 언어가 바뀌면 시스템 기본 화면도 따라간다");
setLocale("ko");
setDeviceLanguages(["en-US"]);
assert.equal(getLocale(), "ko", "직접 고른 언어는 기기 언어보다 우선한다");
setLocale("system");
assert.equal(getLocale(), "en");
setDeviceLanguages(["ko-KR"]);
assert.equal(getLocale(), "ko");

// 12. 화면 코드가 쓰는 리터럴 키는 사전에 있어야 한다. 키 오타는 빌드에서 걸린다.
const sourceDir = fileURLToPath(new URL("..", import.meta.url));
const literal = /\b(t|tp)\(\s*"([^"]+)"/g;
const used: string[] = [];
for (const file of readdirSync(sourceDir, { recursive: true }) as string[]) {
  if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
  const source = readFileSync(join(sourceDir, file), "utf8");
  // tp 는 복수형이라 `.other` 를 가진 키를 가리킨다.
  for (const match of source.matchAll(literal)) used.push(match[1] === "tp" ? `${match[2]}.other` : match[2]);
}
const unknown = [...new Set(used)].filter(key => !(key in ko));
assert.deepEqual(unknown, [], `사전에 없는 키 사용: ${unknown.join(", ")}`);

// 13. 사용자에게 보이는 문구는 화면 코드에 남아 있으면 안 된다.
//     사전(i18n)과 예시 데이터(demo-data)만 한국어를 담는다.
const korean = /[\uAC00-\uD7A3]/;
const leftovers: string[] = [];
for (const file of readdirSync(sourceDir, { recursive: true }) as string[]) {
  if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
  const name = file.replaceAll("\\", "/");
  if (name.startsWith("i18n/") || name === "demo-data.ts" || name.endsWith(".test.ts")) continue;
  const stripped = readFileSync(join(sourceDir, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (korean.test(stripped)) leftovers.push(name);
}
assert.deepEqual(leftovers, [], `한국어 문구가 남아 있는 파일: ${leftovers.join(", ")}`);

// 14. 안드로이드 위젯 리소스(values/ 기본=한국어)도 같은 키를 모두 가져야 한다.
const androidRes = fileURLToPath(new URL("../../android/app/src/main/res/", import.meta.url));
const resourceKeys = (locale: string) => {
  const xml = readFileSync(join(androidRes, locale, "strings.xml"), "utf8");
  const entries = [...xml.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map(match => [match[1], match[2]] as const);
  return new Map(entries);
};
const baseStrings = resourceKeys("values");
const englishStrings = resourceKeys("values-en");
const untranslatedWidget = [...baseStrings.keys()].filter(key => key.startsWith("widget_") && !englishStrings.has(key));
assert.deepEqual(untranslatedWidget, [], `values-en/strings.xml 에 없는 위젯 문구: ${untranslatedWidget.join(", ")}`);
const formatSpecs = (value: string) => [...value.matchAll(/%\d+\$[sd]/g)].map(match => match[0]).sort().join(",");
for (const key of baseStrings.keys()) {
  if (!englishStrings.has(key) || !key.startsWith("widget_")) continue;
  assert.equal(formatSpecs(englishStrings.get(key)!), formatSpecs(baseStrings.get(key)!), `${key} 의 서식 인자 불일치`);
}

console.log("i18n dictionary, fallback, literal-text and widget-resource checks passed");

for (const key of koKeys) { assert.ok(key in id, key); assert.equal(holes(id[key]), holes(ko[key]), key); }
assert.equal(resolveLocale(null, ["id-ID"]), "id");
assert.equal(resolveLocale(null, ["in-ID"]), "id");
assert.equal(resolveLocale("ko", ["id-ID"]), "ko");
setLocale("id");
assert.equal(getLocale(), "id");
assert.equal(translatePlural("id", "calendar.contracts", 2), "2 pemesanan");
assert.ok(formatPrice(45000).includes("45.000"));
const indonesianStrings = resourceKeys("values-in");
for (const key of englishStrings.keys()) { assert.ok(indonesianStrings.has(key), key); assert.equal(formatSpecs(indonesianStrings.get(key)!), formatSpecs(englishStrings.get(key)!), key); }

// Every supported language must cover the full UI and preserve interpolation arguments.
for (const locale of locales) {
  const dictionary = dictionaries[locale];
  for (const key of koKeys) {
    assert.ok(dictionary[key]?.trim(), `${locale}: missing ${key}`);
    assert.equal(holes(dictionary[key]), holes(ko[key]), `${locale}: placeholders in ${key}`);
  }
}
for (const [locale, tag] of [["vi", "vi-VN"], ["th", "th-TH"], ["ms", "ms-MY"]] as const) {
  assert.equal(resolveLocale(null, [tag]), locale);
  assert.equal(resolveLocale(locale, ["en-US"]), locale);
  setLocale(locale);
  assert.equal(getLocale(), locale);
  assert.ok(formatDateTime(crossingDays).length > 0);
  assert.ok(translatePlural(locale, "home.greeting2", 2).includes("2"));
  const strings = resourceKeys(`values-${locale}`);
  for (const key of englishStrings.keys()) {
    assert.ok(strings.has(key), `${locale}: ${key}`);
    assert.equal(formatSpecs(strings.get(key)!), formatSpecs(englishStrings.get(key)!), `${locale}: ${key}`);
  }
}
console.log("Six-language UI coverage, placeholders, device matching and widget resources passed");
