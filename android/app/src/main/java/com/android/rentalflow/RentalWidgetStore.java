package com.android.rentalflow;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TimeZone;

/**
 * Today's rentals and returns, mirrored from the web app while it is open.
 * The widget only reads this snapshot, so a day that moved on is detected instead of shown as today's schedule.
 */
final class RentalWidgetStore {

    static final int VERSION = 1;
    static final int MAX_ITEMS = 3;
    private static final String PREFS = "rental_widget";
    private static final String KEY = "snapshot";
    private static final String LOCALE_KEY = "locale";
    private static final String STATE_READY = "ready";
    private static final String STATE_ONBOARDING = "onboarding";
    private static final long MIN_TIME = 946684800000L;   // 2000-01-01T00:00:00Z
    private static final long MAX_TIME = 4102444800000L;  // 2100-01-01T00:00:00Z

    static final class Item {
        final String id;
        final long at;
        final boolean rental;
        final String product;

        Item(String id, long at, boolean rental, String product) {
            this.id = id;
            this.at = at;
            this.rental = rental;
            this.product = product;
        }
    }

    static final class Snapshot {
        final boolean onboarding;
        final String day;
        final long updatedAt;
        final int rentalCount;
        final int returnCount;
        final List<Item> items;
        final String timeZone;

        Snapshot(boolean onboarding, String day, long updatedAt, int rentalCount, int returnCount, List<Item> items) {
            this(onboarding, day, updatedAt, rentalCount, returnCount, items, TimeZone.getDefault().getID());
        }

        Snapshot(boolean onboarding, String day, long updatedAt, int rentalCount, int returnCount, List<Item> items, String timeZone) {
            this.onboarding = onboarding;
            this.day = day;
            this.updatedAt = updatedAt;
            this.rentalCount = rentalCount;
            this.returnCount = returnCount;
            this.items = Collections.unmodifiableList(items);
            this.timeZone = timeZone;
        }

        /** Signed in, but the workspace is not set up yet: there is nothing honest to show. */
        static Snapshot onboarding() {
            return new Snapshot(true, "", 0L, 0, 0, Collections.<Item>emptyList());
        }
    }

    /**
     * What the widget has to say, decided from the snapshot alone so it stays testable off device.
     * NO_DATA is deliberately not called "signed out": an empty cache cannot tell a logout from an app that was never opened.
     */
    enum State { NO_DATA, ONBOARDING, STALE, EMPTY, ITEMS }

    static State stateOf(Snapshot snapshot, String todayKey) {
        if (snapshot == null) return State.NO_DATA;
        if (snapshot.onboarding) return State.ONBOARDING;
        if (!snapshot.day.equals(todayKey)) return State.STALE;
        return snapshot.items.isEmpty() ? State.EMPTY : State.ITEMS;
    }

    private RentalWidgetStore() {}

    /** Stores the snapshot only when it passes validation. */
    static boolean save(Context context, String json) {
        if (parse(json) == null) return false;
        prefs(context).edit().putString(KEY, json).apply();
        return true;
    }

    static String stored(Context context) {
        return prefs(context).getString(KEY, null);
    }

    static void clear(Context context) {
        prefs(context).edit().remove(KEY).apply();
    }

    /** 앱에서 고른 언어. 위젯이 자기 리소스와 날짜 서식을 그 언어로 그리도록 저장한다. */
    static boolean saveLocale(Context context, String tag) {
        // 지원하지 않는 값이나 빈 값은 저장을 지워 기기 언어를 따르게 한다(system 선택).
        String next = "ko".equals(tag) || "en".equals(tag) || "id".equals(tag) || "vi".equals(tag) || "th".equals(tag) || "ms".equals(tag) ? tag : null;
        if (next == null) {
            if (storedLocale(context) == null) return false;
            prefs(context).edit().remove(LOCALE_KEY).apply();
            return true;
        }
        if (next.equals(storedLocale(context))) return false;
        prefs(context).edit().putString(LOCALE_KEY, next).apply();
        return true;
    }

    /** 저장된 언어. 없거나 지원하지 않는 값이면 null 이고, 그때는 기기 언어를 따른다. */
    static String storedLocale(Context context) {
        String tag = prefs(context).getString(LOCALE_KEY, null);
        return ("ko".equals(tag) || "en".equals(tag) || "id".equals(tag) || "vi".equals(tag) || "th".equals(tag) || "ms".equals(tag)) ? tag : null;
    }

    /** Returns null when nothing is stored or the stored snapshot is malformed. */
    static Snapshot load(Context context) {
        return parse(stored(context));
    }

    static Snapshot parse(String json) {
        if (json == null) return null;
        try {
            JSONObject root = new JSONObject(json);
            if (root.optInt("v", -1) != VERSION) return null;
            String state = root.optString("state", "");
            if (STATE_ONBOARDING.equals(state)) return Snapshot.onboarding();
            if (!STATE_READY.equals(state)) return null;
            String day = root.optString("day", "");
            if (!day.matches("\\d{4}-\\d{2}-\\d{2}")) return null;
            long updatedAt = root.optLong("updatedAt", -1L);
            int rentalCount = root.optInt("rentalCount", -1);
            int returnCount = root.optInt("returnCount", -1);
            if (!usable(updatedAt) || rentalCount < 0 || returnCount < 0) return null;
            JSONArray rows = root.optJSONArray("items");
            if (rows == null || rows.length() > MAX_ITEMS) return null;
            List<Item> items = new ArrayList<>(rows.length());
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = rows.optJSONObject(index);
                if (row == null) return null;
                String id = row.optString("id", "");
                String product = row.optString("product", "").trim();
                String kind = row.optString("kind", "");
                long at = row.optLong("at", -1L);
                if (!id.matches("[\\w-]{8,64}") || product.isEmpty() || product.length() > 60) return null;
                if (!"rental".equals(kind) && !"return".equals(kind)) return null;
                if (!usable(at)) return null;
                items.add(new Item(id, at, "rental".equals(kind), product));
            }
            String zone = root.optString("timeZone", TimeZone.getDefault().getID());
            try { java.time.ZoneId.of(zone); } catch (java.time.DateTimeException invalid) { return null; }
            return new Snapshot(false, day, updatedAt, rentalCount, returnCount, items, zone);
        } catch (JSONException error) {
            return null;
        }
    }

    private static boolean usable(long time) {
        return time >= MIN_TIME && time <= MAX_TIME;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}

