package com.android.rentalflow;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(
        name = "RentalCalendar",
        permissions = {
            @Permission(
                alias = "calendar",
                strings = {Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR})
        })
public class RentalCalendarPlugin extends Plugin {
    private static final Object LOCK = new Object();
    private static final String PREFS = "rental_calendar";
    private static final int MAX_BOOKINGS = 20000;
    private static final int MAX_TITLE = 500;

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            requestPermissionForAlias("calendar", call, "calendarPermissionCallback");
            return;
        }
        doListCalendars(call);
    }

    @PermissionCallback
    public void calendarPermissionCallback(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("errors.calendarPermission", "CALENDAR_PERMISSION");
            return;
        }
        doListCalendars(call);
    }

    private void doListCalendars(PluginCall call) {
        getBridge().execute(() -> {
            try {
                String selection = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">=? AND "
                        + CalendarContract.Calendars.VISIBLE + "=1 AND "
                        + CalendarContract.Calendars.DELETED + "=0";
                String[] args = {String.valueOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)};
                String[] projection = {
                    CalendarContract.Calendars._ID,
                    CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                    CalendarContract.Calendars.ACCOUNT_NAME
                };
                JSArray calendars = new JSArray();
                try (Cursor cursor = getContext().getContentResolver().query(
                        CalendarContract.Calendars.CONTENT_URI, projection, selection, args,
                        CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC")) {
                    while (cursor != null && cursor.moveToNext()) {
                        JSObject item = new JSObject();
                        item.put("id", String.valueOf(cursor.getLong(0)));
                        item.put("name", cursor.isNull(1) ? "" : cursor.getString(1));
                        item.put("account", cursor.isNull(2) ? "" : cursor.getString(2));
                        calendars.put(item);
                    }
                }
                JSObject result = new JSObject();
                result.put("calendars", calendars);
                call.resolve(result);
            } catch (SecurityException error) {
                call.reject("errors.calendarPermission", "CALENDAR_PERMISSION");
            } catch (Exception error) {
                call.reject("errors.calendarSync", "CALENDAR_SYNC");
            }
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        String workspaceKey = call.getString("workspaceKey");
        if (!validKey(workspaceKey)) {
            call.reject("errors.calendarSync", "CALENDAR_SYNC");
            return;
        }
        try {
            synchronized (LOCK) {
                call.resolve(state(readPrefs(workspaceKey)));
            }
        } catch (Exception error) {
            call.reject("errors.calendarSync", "CALENDAR_SYNC");
        }
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String workspaceKey = call.getString("workspaceKey");
        String calendarId = call.getString("calendarId");
        Boolean enabled = call.getBoolean("enabled");
        JSArray bookingIds = call.getArray("bookingIds");
        if (!validKey(workspaceKey)) {
            call.reject("errors.calendarSync", "CALENDAR_SYNC");
            return;
        }
        if (!validCalendarId(calendarId)) {
            call.reject("errors.calendarTarget", "CALENDAR_TARGET");
            return;
        }
        if (enabled == null || bookingIds == null || bookingIds.length() > MAX_BOOKINGS) {
            call.reject("errors.calendarSync", "CALENDAR_SYNC");
            return;
        }
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < bookingIds.length(); i++) {
            String id = bookingIds.optString(i, null);
            if (id != null && !id.isEmpty() && id.length() <= 200) {
                ids.add(id);
            }
        }
        getBridge().execute(() -> {
            synchronized (LOCK) {
                try {
                    JSONObject saved = readPrefs(workspaceKey);
                    String oldCalendar = saved.optString("calendarId", "");
                    boolean oldEnabled = saved.optBoolean("enabled", false);
                    boolean targetChanged = !calendarId.equals(oldCalendar);
                    if ((enabled || targetChanged)
                            && getPermissionState("calendar") != PermissionState.GRANTED) {
                        call.reject("errors.calendarPermission", "CALENDAR_PERMISSION");
                        return;
                    }
                    if ((enabled || targetChanged) && !calendarWritable(calendarId)) {
                        call.reject("errors.calendarTarget", "CALENDAR_TARGET");
                        return;
                    }
                    if (enabled || targetChanged) {
                        String calendarName = readCalendarDisplayName(calendarId);
                        if (calendarName != null) {
                            saved.put("calendarName", calendarName);
                        }
                    }
                    if (targetChanged) {
                        saved.put("linked", new JSONObject());
                        saved.put("seen", new JSONArray());
                    }
                    saved.put("calendarId", calendarId);
                    saved.put("enabled", enabled);
                    if (enabled && (!oldEnabled || targetChanged)) {
                        saved.put("seen", new JSONArray(ids));
                    }
                    if (!saved.has("linked")) {
                        saved.put("linked", new JSONObject());
                    }
                    if (!saved.has("seen")) {
                        saved.put("seen", new JSONArray());
                    }
                    writePrefs(workspaceKey, saved);
                    call.resolve(state(saved));
                } catch (SecurityException error) {
                    call.reject("errors.calendarPermission", "CALENDAR_PERMISSION");
                } catch (Exception error) {
                    call.reject("errors.calendarSync", "CALENDAR_SYNC");
                }
            }
        });
    }

    @PluginMethod
    public void sync(PluginCall call) {
        String workspaceKey = call.getString("workspaceKey");
        JSArray entriesArray = call.getArray("entries");
        JSArray bookingIdsArray = call.getArray("bookingIds");
        boolean includeExisting = Boolean.TRUE.equals(call.getBoolean("includeExisting"));
        if (!validKey(workspaceKey) || entriesArray == null || bookingIdsArray == null
                || entriesArray.length() > MAX_BOOKINGS || bookingIdsArray.length() > MAX_BOOKINGS) {
            call.reject("errors.calendarSync", "CALENDAR_SYNC");
            return;
        }
        getBridge().execute(() -> {
            synchronized (LOCK) {
                try {
                    JSONObject saved = readPrefs(workspaceKey);
                    boolean enabled = saved.optBoolean("enabled", false);
                    if (!includeExisting && !enabled) {
                        resolveCounts(call, 0, 0, 0, 0);
                        return;
                    }
                    if (getPermissionState("calendar") != PermissionState.GRANTED) {
                        call.reject("errors.calendarPermission", "CALENDAR_PERMISSION");
                        return;
                    }
                    String calendarId = saved.optString("calendarId", "");
                    if (!validCalendarId(calendarId) || !calendarWritable(calendarId)) {
                        call.reject("errors.calendarTarget", "CALENDAR_TARGET");
                        return;
                    }
                    Set<String> present = new HashSet<>();
                    for (int i = 0; i < entriesArray.length(); i++) {
                        JSONObject entry = entriesArray.optJSONObject(i);
                        if (entry == null) {
                            continue;
                        }
                        String id = entry.optString("id", "");
                        if (!id.isEmpty()) {
                            present.add(id);
                        }
                    }
                    JSONArray seenArray = saved.optJSONArray("seen");
                    Set<String> seen = new HashSet<>();
                    if (seenArray != null) {
                        for (int i = 0; i < seenArray.length(); i++) {
                            String value = seenArray.optString(i, null);
                            if (value != null) {
                                seen.add(value);
                            }
                        }
                    }
                    JSONObject linked = saved.optJSONObject("linked");
                    if (linked == null) {
                        linked = new JSONObject();
                    }
                    int inserted = 0, updated = 0, deleted = 0, failed = 0;
                    for (int i = 0; i < entriesArray.length(); i++) {
                        JSONObject entry = entriesArray.optJSONObject(i);
                        if (entry == null) {
                            continue;
                        }
                        String id = entry.optString("id", "");
                        String title = entry.optString("title", null);
                        long start = entry.optLong("start", Long.MIN_VALUE);
                        long end = entry.optLong("end", Long.MIN_VALUE);
                        if (id.isEmpty() || id.length() > 200 || title == null
                                || title.length() > MAX_TITLE || start < 0 || end <= start) {
                            failed++;
                            continue;
                        }
                        boolean isLinked = linked.has(id);
                        if (!includeExisting && !isLinked && seen.contains(id)) {
                            continue;
                        }
                        String marker = marker(workspaceKey, id);
                        EventRow row = findEvent(calendarId, marker);
                        if (row != null) {
                            boolean changed = !title.equals(row.title == null ? "" : row.title)
                                    || row.start != start || row.end != end;
                            if (changed) {
                                int rows = updateOwned(row.id, calendarId, marker, title, start, end);
                                if (rows > 0) {
                                    if (isLinked) {
                                        updated++;
                                    } else {
                                        inserted++;
                                    }
                                    seen.add(id);
                                    linked.put(id, String.valueOf(row.id));
                                    persist(workspaceKey, saved, linked, seen);
                                } else {
                                    failed++;
                                }
                            } else {
                                seen.add(id);
                                if (!String.valueOf(row.id).equals(linked.optString(id, ""))) {
                                    linked.put(id, String.valueOf(row.id));
                                    persist(workspaceKey, saved, linked, seen);
                                }
                                if (!isLinked) {
                                    inserted++;
                                }
                            }
                        } else if (isLinked && !includeExisting) {
                            linked.remove(id);
                            seen.add(id);
                            persist(workspaceKey, saved, linked, seen);
                        } else {
                            Long created = insertEvent(calendarId, marker, title, start, end);
                            if (created != null) {
                                seen.add(id);
                                linked.put(id, String.valueOf(created));
                                inserted++;
                                persist(workspaceKey, saved, linked, seen);
                            } else {
                                failed++;
                            }
                        }
                    }
                    for (int i = 0; i < bookingIdsArray.length(); i++) {
                        String value = bookingIdsArray.optString(i, null);
                        if (value != null && !value.isEmpty() && !present.contains(value)) {
                            seen.add(value);
                        }
                    }
                    persist(workspaceKey, saved, linked, seen);
                    List<String> linkedIds = new ArrayList<>();
                    Iterator<String> keys = linked.keys();
                    while (keys.hasNext()) {
                        linkedIds.add(keys.next());
                    }
                    for (String id : linkedIds) {
                        if (present.contains(id)) {
                            continue;
                        }
                        String marker = marker(workspaceKey, id);
                        EventRow row = findEvent(calendarId, marker);
                        if (row == null) {
                            linked.remove(id);
                            seen.add(id);
                            persist(workspaceKey, saved, linked, seen);
                            continue;
                        }
                        int rows = deleteOwned(row.id, calendarId, marker);
                        if (rows > 0) {
                            linked.remove(id);
                            seen.add(id);
                            deleted++;
                            persist(workspaceKey, saved, linked, seen);
                        } else {
                            failed++;
                        }
                    }
                    resolveCounts(call, inserted, updated, deleted, failed);
                } catch (SecurityException error) {
                    call.reject("errors.calendarPermission", "CALENDAR_PERMISSION");
                } catch (Exception error) {
                    call.reject("errors.calendarSync", "CALENDAR_SYNC");
                }
            }
        });
    }

    private JSObject state(JSONObject saved) {
        JSObject result = new JSObject();
        result.put("calendarId", saved.optString("calendarId", ""));
        result.put("enabled", saved.optBoolean("enabled", false));
        result.put("permission", getPermissionState("calendar") == PermissionState.GRANTED);
        String calendarName = saved.optString("calendarName", "");
        if (!calendarName.isEmpty()) {
            result.put("calendarName", calendarName);
        }
        return result;
    }

    private void resolveCounts(PluginCall call, int inserted, int updated, int deleted, int failed) {
        JSObject result = new JSObject();
        result.put("inserted", inserted);
        result.put("updated", updated);
        result.put("deleted", deleted);
        result.put("failed", failed);
        call.resolve(result);
    }

    private boolean calendarWritable(String calendarId) {
        String[] projection = {CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL};
        String selection = CalendarContract.Calendars._ID + "=? AND "
                + CalendarContract.Calendars.DELETED + "=0";
        try (Cursor cursor = getContext().getContentResolver().query(
                CalendarContract.Calendars.CONTENT_URI, projection, selection,
                new String[]{calendarId}, null)) {
            if (cursor == null) {
                throw new IllegalStateException("query");
            }
            return cursor.moveToFirst()
                    && cursor.getInt(0) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        }
    }

    private String readCalendarDisplayName(String calendarId) {
        String[] projection = {CalendarContract.Calendars.CALENDAR_DISPLAY_NAME};
        String selection = CalendarContract.Calendars._ID + "=? AND "
                + CalendarContract.Calendars.DELETED + "=0";
        try (Cursor cursor = getContext().getContentResolver().query(
                CalendarContract.Calendars.CONTENT_URI, projection, selection,
                new String[]{calendarId}, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) {
                String name = cursor.getString(0);
                if (name != null && !name.trim().isEmpty()) {
                    return name.trim();
                }
            }
        }
        return null;
    }

    private EventRow findEvent(String calendarId, String marker) {
        String[] projection = {
            CalendarContract.Events._ID,
            CalendarContract.Events.TITLE,
            CalendarContract.Events.DTSTART,
            CalendarContract.Events.DTEND
        };
        String selection = CalendarContract.Events.CALENDAR_ID + "=? AND "
                + CalendarContract.Events.CUSTOM_APP_PACKAGE + "=? AND "
                + CalendarContract.Events.CUSTOM_APP_URI + "=? AND "
                + CalendarContract.Events.DELETED + "=0";
        String[] args = {calendarId, getContext().getPackageName(), marker};
        try (Cursor cursor = getContext().getContentResolver().query(
                CalendarContract.Events.CONTENT_URI, projection, selection, args, null)) {
            if (cursor == null) {
                throw new IllegalStateException("query");
            }
            if (cursor.moveToFirst()) {
                return new EventRow(
                        cursor.getLong(0),
                        cursor.isNull(1) ? "" : cursor.getString(1),
                        cursor.isNull(2) ? 0 : cursor.getLong(2),
                        cursor.isNull(3) ? 0 : cursor.getLong(3));
            }
        }
        return null;
    }

    private Long insertEvent(String calendarId, String marker, String title, long start, long end) {
        ContentValues values = eventValues(marker, title, start, end);
        values.put(CalendarContract.Events.CALENDAR_ID, Long.parseLong(calendarId));
        Uri uri = getContext().getContentResolver().insert(
                CalendarContract.Events.CONTENT_URI, values);
        return uri == null ? null : ContentUris.parseId(uri);
    }

    private int updateOwned(long eventId, String calendarId, String marker,
            String title, long start, long end) {
        String selection = CalendarContract.Events._ID + "=? AND "
                + CalendarContract.Events.CALENDAR_ID + "=? AND "
                + CalendarContract.Events.CUSTOM_APP_PACKAGE + "=? AND "
                + CalendarContract.Events.CUSTOM_APP_URI + "=? AND "
                + CalendarContract.Events.DELETED + "=0";
        String[] args = {
            String.valueOf(eventId), calendarId, getContext().getPackageName(), marker
        };
        return getContext().getContentResolver().update(
                CalendarContract.Events.CONTENT_URI, eventValues(marker, title, start, end),
                selection, args);
    }

    private int deleteOwned(long eventId, String calendarId, String marker) {
        String selection = CalendarContract.Events._ID + "=? AND "
                + CalendarContract.Events.CALENDAR_ID + "=? AND "
                + CalendarContract.Events.CUSTOM_APP_PACKAGE + "=? AND "
                + CalendarContract.Events.CUSTOM_APP_URI + "=? AND "
                + CalendarContract.Events.DELETED + "=0";
        String[] args = {
            String.valueOf(eventId), calendarId, getContext().getPackageName(), marker
        };
        return getContext().getContentResolver().delete(
                CalendarContract.Events.CONTENT_URI, selection, args);
    }

    private ContentValues eventValues(String marker, String title, long start, long end) {
        ContentValues values = new ContentValues();
        values.put(CalendarContract.Events.TITLE, title);
        values.put(CalendarContract.Events.DTSTART, start);
        values.put(CalendarContract.Events.DTEND, end);
        values.put(CalendarContract.Events.EVENT_TIMEZONE, "UTC");
        values.put(CalendarContract.Events.CUSTOM_APP_PACKAGE, getContext().getPackageName());
        values.put(CalendarContract.Events.CUSTOM_APP_URI, marker);
        return values;
    }

    private void persist(String workspaceKey, JSONObject saved, JSONObject linked, Set<String> seen) {
        try {
            saved.put("linked", linked);
            saved.put("seen", new JSONArray(seen));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
        writePrefs(workspaceKey, saved);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private JSONObject readPrefs(String workspaceKey) {
        String raw = prefs().getString(prefsKey(workspaceKey), null);
        if (raw == null) {
            return new JSONObject();
        }
        try {
            return new JSONObject(raw);
        } catch (Exception error) {
            return new JSONObject();
        }
    }

    private void writePrefs(String workspaceKey, JSONObject saved) {
        if (!prefs().edit().putString(prefsKey(workspaceKey), saved.toString()).commit()) {
            throw new IllegalStateException("prefs");
        }
    }

    private String prefsKey(String workspaceKey) {
        return sha256(workspaceKey);
    }

    private String marker(String workspaceKey, String bookingId) {
        JSONArray parts = new JSONArray();
        parts.put(workspaceKey);
        parts.put(bookingId);
        return "rentalflow://" + sha256(parts.toString());
    }

    private String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            char[] digits = "0123456789abcdef".toCharArray();
            char[] hex = new char[bytes.length * 2];
            for (int i = 0; i < bytes.length; i++) {
                int valueByte = bytes[i] & 0xff;
                hex[i * 2] = digits[valueByte >>> 4];
                hex[i * 2 + 1] = digits[valueByte & 0xf];
            }
            return new String(hex);
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private boolean validKey(String workspaceKey) {
        return workspaceKey != null && !workspaceKey.isEmpty() && workspaceKey.length() <= 512;
    }

    private boolean validCalendarId(String calendarId) {
        if (calendarId == null || calendarId.isEmpty() || calendarId.length() > 19) {
            return false;
        }
        try {
            return Long.parseLong(calendarId) > 0;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    private static final class EventRow {
        final long id;
        final String title;
        final long start;
        final long end;

        EventRow(long id, String title, long start, long end) {
            this.id = id;
            this.title = title;
            this.start = start;
            this.end = end;
        }
    }
}
