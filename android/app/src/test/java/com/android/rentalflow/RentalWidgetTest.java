package com.android.rentalflow;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Off-device checks for the home screen widget: snapshot validation, state selection and the body budget. */
public class RentalWidgetTest {

    private static final String TODAY = "2026-09-22";
    private static final String ID = "a1b2c3d4-0000-4000-8000-000000000001";
    private static final long NOON = 1789000000000L;
    private static final String ONBOARDING = "{\"v\":1,\"state\":\"onboarding\"}";

    private static String row(String id, String kind, long at, String product) {
        return "{\"id\":\"" + id + "\",\"at\":" + at + ",\"kind\":\"" + kind + "\",\"product\":\"" + product + "\"}";
    }

    private static String payload(String day, String... rows) {
        return "{\"v\":1,\"state\":\"ready\",\"day\":\"" + day + "\",\"updatedAt\":" + NOON + ",\"rentalCount\":2,\"returnCount\":1,\"items\":[" + String.join(",", rows) + "]}";
    }

    @Test
    public void readsTheSnapshotTheWebAppWrites() {
        RentalWidgetStore.Snapshot snapshot = RentalWidgetStore.parse(payload(TODAY, row(ID, "rental", NOON, "아반떼")));
        assertNotNull(snapshot);
        assertFalse(snapshot.onboarding);
        assertEquals(TODAY, snapshot.day);
        assertEquals(NOON, snapshot.updatedAt);
        assertEquals(2, snapshot.rentalCount);
        assertEquals(1, snapshot.returnCount);
        assertEquals(1, snapshot.items.size());
        assertTrue(snapshot.items.get(0).rental);
        assertEquals("아반떼", snapshot.items.get(0).product);
        RentalWidgetStore.Snapshot setup = RentalWidgetStore.parse(ONBOARDING);
        assertNotNull(setup);
        assertTrue(setup.onboarding);
    }

    @Test
    public void usesWorkspaceTimeZoneAndAcceptsOldSnapshots() {
        String legacy = payload(TODAY);
        assertNotNull(RentalWidgetStore.parse(legacy));
        String jakarta = legacy.replace("\"v\":1", "\"timeZone\":\"Asia/Jakarta\",\"v\":1");
        assertEquals("Asia/Jakarta", RentalWidgetStore.parse(jakarta).timeZone);
        assertNull(RentalWidgetStore.parse(jakarta.replace("Asia/Jakarta", "Invalid/Zone")));
    }

    @Test
    public void dropsAnythingTheWidgetCannotTrust() {
        assertNull(RentalWidgetStore.parse(null));
        assertNull(RentalWidgetStore.parse(""));
        assertNull(RentalWidgetStore.parse("not json"));
        assertNull(RentalWidgetStore.parse("{}"));
        assertNull(RentalWidgetStore.parse(payload(TODAY).replace("\"v\":1", "\"v\":2")));
        assertNull(RentalWidgetStore.parse(payload(TODAY).replace("\"state\":\"ready\"", "\"state\":\"logged-out\"")));
        assertNull(RentalWidgetStore.parse(payload(TODAY).replace("\"state\":\"ready\",", "")));
        assertNull(RentalWidgetStore.parse(payload("22-09-2026")));
        assertNull(RentalWidgetStore.parse(payload(TODAY).replace("\"updatedAt\":" + NOON, "\"updatedAt\":0")));
        assertNull(RentalWidgetStore.parse(payload(TODAY, row("../../etc/passwd", "rental", NOON, "아반떼"))));
        assertNull(RentalWidgetStore.parse(payload(TODAY, row(ID, "cancel", NOON, "아반떼"))));
        assertNull(RentalWidgetStore.parse(payload(TODAY, row(ID, "rental", 0, "아반떼"))));
        assertNull(RentalWidgetStore.parse(payload(TODAY, row(ID, "rental", NOON, ""))));
        assertNull(RentalWidgetStore.parse(payload(TODAY, row(ID, "rental", NOON, "아반떼"), row(ID, "rental", NOON, "쏘나타"), row(ID, "rental", NOON, "그랜저"), row(ID, "rental", NOON, "스포티지"))));
    }

    @Test
    public void picksTheStateForTheDayAndTheData() {
        RentalWidgetStore.Snapshot today = RentalWidgetStore.parse(payload(TODAY, row(ID, "rental", NOON, "아반떼")));
        RentalWidgetStore.Snapshot yesterday = RentalWidgetStore.parse(payload("2026-09-21", row(ID, "rental", NOON, "아반떼")));
        RentalWidgetStore.Snapshot quietDay = RentalWidgetStore.parse(payload(TODAY));
        assertEquals("an empty cache is a connect prompt, not a logout", RentalWidgetStore.State.NO_DATA, RentalWidgetStore.stateOf(null, TODAY));
        assertEquals(RentalWidgetStore.State.ONBOARDING, RentalWidgetStore.stateOf(RentalWidgetStore.parse(ONBOARDING), TODAY));
        assertEquals(RentalWidgetStore.State.ITEMS, RentalWidgetStore.stateOf(today, TODAY));
        assertEquals(RentalWidgetStore.State.EMPTY, RentalWidgetStore.stateOf(quietDay, TODAY));
        assertEquals("yesterday's numbers are never today's", RentalWidgetStore.State.STALE, RentalWidgetStore.stateOf(yesterday, TODAY));
        assertEquals("a skipped day stays stale", RentalWidgetStore.State.STALE, RentalWidgetStore.stateOf(yesterday, "2026-09-23"));
    }

    @Test
    public void fitsOnlyTheRowsTheBodyHasRoomFor() {
        // 기기 실측(density 3.0, 배율 1.0): 상단 띠 8+15sp+8 = 37dp(111px), 아래 여백 14dp(42px),
        // 구획 간격 12dp(36px), 하단 액션 48dp(144px). 그래서 본문은 212dp→303px, 310dp→597px, 180dp→207px.
        // 일정 행 48dp(144px) + 행 간격 4dp(12px) → 4x2 에서 두 행, 확장에서 세 행.
        float row = 144;
        float gap = 12;
        assertEquals("기본 4x2: 두 행", 2, RentalWidgetProvider.visibleRows(302, row, gap, 3));
        assertEquals("세로로 키워도 두 행까지만", 2, RentalWidgetProvider.visibleRows(596, row, gap, 3));
        assertEquals("지원 최소 높이: 한 행", 1, RentalWidgetProvider.visibleRows(206, row, gap, 3));
        assertEquals("본문이 없으면 행도 없다", 0, RentalWidgetProvider.visibleRows(-40, row, gap, 3));
        assertEquals("일정이 한 건이면 한 행", 1, RentalWidgetProvider.visibleRows(596, row, gap, 1));
        assertEquals("행 높이를 못 재면 그리지 않는다", 0, RentalWidgetProvider.visibleRows(596, 0, gap, 3));
    }

    @Test
    public void foldsTheSupplementsBeforeTheCore() {
        assertTrue("넓고 기본 배율이면 헤더 날짜를 남긴다", RentalWidgetProvider.showsHeaderDate(376, 1.0f));
        assertFalse("좁으면 헤더 날짜부터 접는다", RentalWidgetProvider.showsHeaderDate(180, 1.0f));
        assertFalse("큰 글씨에서는 폭과 무관하게 접는다", RentalWidgetProvider.showsHeaderDate(376, 1.3f));
        assertTrue("넓으면 좌측 문구를 남긴다", RentalWidgetProvider.showsFooterLeft(376));
        assertFalse("최소 폭에서는 좌측 문구를 접고 48dp 액션만 남긴다", RentalWidgetProvider.showsFooterLeft(180));
        assertTrue("갱신 시각은 폭이 넉넉할 때만", RentalWidgetProvider.showsFooterMeta(376, 1.0f));
        assertFalse(RentalWidgetProvider.showsFooterMeta(180, 1.0f));
        assertFalse(RentalWidgetProvider.showsFooterMeta(376, 1.3f));
        assertTrue("본문이 감당하면 보조문구를 남긴다", RentalWidgetProvider.fitsInBody(615, 336));
        assertFalse("본문이 부족하면 접는다", RentalWidgetProvider.fitsInBody(321, 336));
    }
}
