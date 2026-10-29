package com.android.rentalflow;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Home screen widget: today's rentals and returns.
 *
 * <p>Header says what the screen is, the body is either the day's real schedule or one calm empty line, and the footer
 * keeps the single primary action plus — when it earns its keep — a way back into the app. Which optional piece
 * survives a small widget is decided from measured text heights only; type is never shrunk to make something fit.
 * Tokens, folding order and verification live in docs/android-widget-design.md.
 */
public class RentalWidgetProvider extends AppWidgetProvider {

    /** Local midnight redraw, so a new day never leaves the previous day's numbers on screen. */
    static final String ACTION_TICK = "com.team226.rentalflow.widget.TICK";

    private static final int INSET_X_DP = 16;               // 본문/하단의 가로 여백
    private static final int INSET_BOTTOM_DP = 14;          // 카드 아래 여백: 위는 상단 띠가 대신한다
    private static final int BAND_PAD_DP = 8;               // 상단 띠 위아래 안쪽 여백
    private static final int HEADER_TITLE_SP = 15;          // 띠 제목 크기(styles.xml 과 같게 유지)
    private static final int ACTION_DP = 48;
    private static final int ROW_MIN_DP = 48;
    private static final int ROW_GAP_DP = 4;
    private static final int ROW_PADDING_DP = 8;            // 행 위아래 안쪽 여백 합계
    private static final int HEADER_GAP_DP = 8;             // 헤더 → 본문
    private static final int FOOTER_GAP_DP = 4;             // 본문 → 하단 액션
    private static final int ICON_DP = 44;
    private static final int ICON_GAP_DP = 12;
    private static final int SUBTITLE_GAP_DP = 4;
    private static final int ROW_MAX = 2;                  // 4x2 상한: 세 번째 행은 그리지 않는다
    private static final float HEADER_DATE_WIDTH_DP = 220;  // 이보다 좁으면 헤더 날짜를 접는다
    private static final float FOOTER_LEFT_WIDTH_DP = 200;   // 이보다 좁으면 좌측 문구를 접고 48dp 액션만 남긴다
    private static final float FOOTER_META_WIDTH_DP = 260;   // 갱신 시각은 폭이 넉넉할 때만 남긴다
    private static final float EMPTY_ICON_WIDTH_DP = 260;     // 이보다 좁으면 아이콘을 접고 짧은 문구로 전체 폭을 쓴다

    private static final int[] ROW_IDS = { R.id.widget_row_1, R.id.widget_row_2 };
    private static final int[] BAR_IDS = { R.id.widget_row_1_bar, R.id.widget_row_2_bar };
    private static final int[] TIME_IDS = { R.id.widget_row_1_time, R.id.widget_row_2_time };
    private static final int[] KIND_IDS = { R.id.widget_row_1_kind, R.id.widget_row_2_kind };
    private static final int[] PRODUCT_IDS = { R.id.widget_row_1_product, R.id.widget_row_2_product };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) manager.updateAppWidget(appWidgetId, render(context, appWidgetId));
        scheduleTick(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        manager.updateAppWidget(appWidgetId, render(context, appWidgetId));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_TICK.equals(intent.getAction())) {
            refresh(context);
            scheduleTick(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onEnabled(Context context) {
        scheduleTick(context);
    }

    /** Redraws every placed widget. Called by the plugin whenever the web app rewrites the snapshot. */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int appWidgetId : manager.getAppWidgetIds(new ComponentName(context, RentalWidgetProvider.class))) {
            manager.updateAppWidget(appWidgetId, render(context, appWidgetId));
        }
    }

    private static RemoteViews render(Context context, int appWidgetId) {
        return render(context, RentalWidgetStore.load(context), heightDp(context, appWidgetId), widthDp(context, appWidgetId));
    }

    /** Renders one state. Package-private so the debug-only preview harness can drive it with fixtures. */
    static RemoteViews render(Context context, RentalWidgetStore.Snapshot snapshot, int heightDp, int widthDp) {
        Context view = localizedContext(context);
        Locale locale = localeOf(RentalWidgetStore.storedLocale(context));
        TimeZone zone = snapshot == null ? TimeZone.getDefault() : TimeZone.getTimeZone(snapshot.timeZone);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        RentalWidgetStore.State state = RentalWidgetStore.stateOf(snapshot, format("yyyy-MM-dd", new Date(), locale, zone));
        DisplayMetrics metrics = view.getResources().getDisplayMetrics();
        float dp = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 1, metrics);
        float fontScale = metrics.scaledDensity / metrics.density;
        float widthPx = widthDp * dp;
        float bodyPx = bodyHeightPx(heightDp, dp) - measuredLine(view, HEADER_TITLE_SP, true) - ACTION_DP * dp;
        float rowPx = Math.max(ROW_MIN_DP * dp, measuredLine(view, 15, true) + measuredLine(view, 12, false) + ROW_PADDING_DP * dp);
        boolean items = state == RentalWidgetStore.State.ITEMS && snapshot != null && !snapshot.items.isEmpty();

        showHeader(view, views, widthDp, fontScale, locale, zone);
        if (items) showItems(view, views, snapshot.items, visibleRows(bodyPx, rowPx, ROW_GAP_DP * dp, snapshot.items.size()), locale, zone);
        else showEmpty(view, views, state, bodyPx, widthPx, dp);
        showFooter(view, views, state, snapshot, widthDp, fontScale, locale, zone);
        return views;
    }

    /** 앱에서 고른 언어의 리소스를 쓰기 위한 Context. 저장된 언어가 없으면 기기 언어를 따른다. */
    private static Context localizedContext(Context context) {
        String tag = RentalWidgetStore.storedLocale(context);
        Locale locale = localeOf(tag);
        Configuration configuration = new Configuration(context.getResources().getConfiguration());
        configuration.setLocale(locale);
        configuration.setLayoutDirection(locale);
        return context.createConfigurationContext(configuration);
    }

    private static Locale localeOf(String tag) {
        Locale value = tag == null ? Locale.getDefault() : Locale.forLanguageTag(tag);
        String language = value.getLanguage();
        return language.equals("ko") || language.equals("en") || language.equals("id") || language.equals("in") || language.equals("vi") || language.equals("th") || language.equals("ms") ? value : Locale.ENGLISH;
    }

    /** 좌측 제목과 우측 날짜. 날짜는 부가 정보라 좁거나 글자가 크면 접는다. */
    private static void showHeader(Context context, RemoteViews views, float widthDp, float fontScale, Locale locale, TimeZone zone) {
        views.setTextViewText(R.id.widget_header_title, context.getString(R.string.widget_header));
        boolean date = showsHeaderDate(widthDp, fontScale);
        views.setViewVisibility(R.id.widget_date, date ? View.VISIBLE : View.GONE);
        if (date) views.setTextViewText(R.id.widget_date, format("M.d (E)", new Date(), locale, zone));
    }

    /** 시간순 일정 행. 모든 행이 같은 형식이고, 들어가는 만큼만 보여준다. */
    private static void showItems(Context context, RemoteViews views, List<RentalWidgetStore.Item> items, int rows, Locale locale, TimeZone zone) {
        views.setViewVisibility(R.id.widget_empty, View.GONE);
        views.setViewVisibility(R.id.widget_items, View.VISIBLE);
        for (int index = 0; index < ROW_IDS.length; index++) {
            boolean visible = index < rows && index < items.size();
            views.setViewVisibility(ROW_IDS[index], visible ? View.VISIBLE : View.GONE);
            if (!visible) continue;
            RentalWidgetStore.Item item = items.get(index);
            String time = format("HH:mm", new Date(item.at), locale, zone);
            String kind = context.getString(item.rental ? R.string.widget_kind_rental : R.string.widget_kind_return);
            int color = context.getColor(item.rental ? R.color.widget_green : R.color.widget_blue);
            views.setTextViewText(TIME_IDS[index], time);
            views.setTextViewText(KIND_IDS[index], kind);
            views.setTextColor(KIND_IDS[index], color);
            views.setInt(BAR_IDS[index], "setBackgroundColor", color);
            views.setTextViewText(PRODUCT_IDS[index], item.product);
            views.setContentDescription(ROW_IDS[index], context.getString(R.string.widget_row_description, time, kind, item.product));
            views.setOnClickPendingIntent(ROW_IDS[index], openApp(context, 10 + index, link("booking", item.id)));
        }
    }

    /**
     * 아이콘 + 핵심 문구 + (공간이 되면) 보조문구. 아이콘과 문구는 가로로 나란히 서므로 필요한 높이는 둘 중 큰 쪽이다.
     * 접는 순서: 보조문구 → 아이콘 → 제목 한 줄. 아이콘을 접으면 넓어진 폭으로 다시 잰다.
     */
    private static void showEmpty(Context context, RemoteViews views, RentalWidgetStore.State state, float bodyPx, float widthPx, float dp) {
        views.setViewVisibility(R.id.widget_items, View.GONE);
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
        // 좁은 폭에서는 아이콘을 접고 전용 짧은 문구로 전체 폭을 쓴다. 핵심 문구가 말줄임으로 사라지면 안 된다.
        boolean compact = widthPx < EMPTY_ICON_WIDTH_DP * dp;
        CharSequence title = context.getString(compact ? shortTitle(state) : title(state));
        CharSequence subtitle = context.getString(subtitle(state));
        float iconPx = ICON_DP * dp;
        float iconGap = ICON_GAP_DP * dp;
        float textWidthPx = widthPx - INSET_X_DP * 2 * dp - (compact ? 0f : iconPx + iconGap);
        float titlePx = measuredText(context, title, 17, true, 2, textWidthPx);
        int lines = fitsInBody(bodyPx, titlePx) ? 2 : 1;
        if (lines == 1) titlePx = measuredText(context, title, 17, true, 1, textWidthPx);
        boolean icon = !compact && fitsInBody(bodyPx, Math.max(iconPx, titlePx));
        if (!icon) {
            textWidthPx = widthPx - INSET_X_DP * 2 * dp;
            titlePx = measuredText(context, title, 17, true, lines, textWidthPx);
        }
        float subtitlePx = measuredText(context, subtitle, 12, false, 2, textWidthPx);
        boolean showsSubtitle = fitsInBody(bodyPx, Math.max(icon ? iconPx : 0f, titlePx + SUBTITLE_GAP_DP * dp + subtitlePx));
        views.setViewVisibility(R.id.widget_empty_icon, icon ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_subtitle, showsSubtitle ? View.VISIBLE : View.GONE);
        views.setInt(R.id.widget_message, "setMaxLines", lines);
        views.setTextViewText(R.id.widget_message, title);
        if (showsSubtitle) views.setTextViewText(R.id.widget_subtitle, subtitle);
    }

    /**
     * 좌측은 앱으로 들어가는 48dp 터치 영역이고, 우측은 상태별 주요 액션(48dp)이다.
     * 갱신 시각은 읽는 정보일 뿐이라 작은 보조문구로만 두고 버튼처럼 만들지 않는다.
     */
    private static void showFooter(Context context, RemoteViews views, RentalWidgetStore.State state, RentalWidgetStore.Snapshot snapshot, float widthDp, float fontScale, Locale locale, TimeZone zone) {
        boolean booking = state == RentalWidgetStore.State.ITEMS || state == RentalWidgetStore.State.EMPTY;
        int label = booking ? R.string.widget_action_new
                : state == RentalWidgetStore.State.STALE ? R.string.widget_action_refresh
                : state == RentalWidgetStore.State.ONBOARDING ? R.string.widget_action_setup
                : R.string.widget_action_open_app;
        views.setTextViewText(R.id.widget_action_button, context.getString(label));
        views.setContentDescription(R.id.widget_action, context.getString(booking ? R.string.widget_action_new_description : label));
        // '+ 새 예약' 은 새 예약 편집기로, 나머지 상태의 주요 액션은 앱의 오늘 화면으로 들어간다.
        views.setOnClickPendingIntent(R.id.widget_action, openApp(context, 2, link(booking ? "new" : "refresh", "1")));

        CharSequence left = null;
        float leftSp = 12f;
        boolean opensToday = false;
        if (state == RentalWidgetStore.State.ITEMS && snapshot != null) {
            left = context.getString(R.string.widget_footer_counts, snapshot.rentalCount, snapshot.returnCount);
            opensToday = true;
        } else if (state == RentalWidgetStore.State.EMPTY) {
            left = context.getString(R.string.widget_footer_open);
            leftSp = 13f;
            opensToday = true;
        } else if (state == RentalWidgetStore.State.STALE && snapshot != null) {
            left = context.getString(R.string.widget_meta_time, format("M.d HH:mm", new Date(snapshot.updatedAt), locale, zone));
        }
        boolean showsLeft = left != null && showsFooterLeft(widthDp);
        views.setViewVisibility(R.id.widget_footer_left, showsLeft ? View.VISIBLE : View.GONE);
        if (!showsLeft) return;
        views.setTextViewText(R.id.widget_summary, left);
        views.setTextViewTextSize(R.id.widget_summary, TypedValue.COMPLEX_UNIT_SP, leftSp);
        views.setTextColor(R.id.widget_summary, context.getColor(state == RentalWidgetStore.State.EMPTY ? R.color.widget_green : R.color.widget_muted));
        if (opensToday) {
            views.setOnClickPendingIntent(R.id.widget_footer_left, openApp(context, 1, link("refresh", "1")));
            views.setContentDescription(R.id.widget_footer_left, context.getString(R.string.widget_footer_open_description));
        }
        boolean meta = state == RentalWidgetStore.State.ITEMS && snapshot != null && showsFooterMeta(widthDp, fontScale);
        views.setViewVisibility(R.id.widget_meta, meta ? View.VISIBLE : View.GONE);
        if (meta) views.setTextViewText(R.id.widget_meta, context.getString(R.string.widget_meta_time, format("HH:mm", new Date(snapshot.updatedAt), locale, zone)));
    }

    private static int title(RentalWidgetStore.State state) {
        switch (state) {
            case EMPTY: return R.string.widget_empty;
            case STALE: return R.string.widget_stale;
            case ONBOARDING: return R.string.widget_setup;
            default: return R.string.widget_connect;
        }
    }

    private static int subtitle(RentalWidgetStore.State state) {
        switch (state) {
            case EMPTY: return R.string.widget_empty_subtitle;
            case STALE: return R.string.widget_stale_subtitle;
            case ONBOARDING: return R.string.widget_setup_subtitle;
            default: return R.string.widget_connect_subtitle;
        }
    }

    /** 좁은 폭용 짧은 핵심 문구. 두 줄 안에 뜻이 온전히 남는다. */
    private static int shortTitle(RentalWidgetStore.State state) {
        switch (state) {
            case EMPTY: return R.string.widget_empty_short;
            case STALE: return R.string.widget_stale_short;
            case ONBOARDING: return R.string.widget_setup_short;
            default: return R.string.widget_connect_short;
        }
    }

    /** 본문에 실제로 들어가는 일정 행 수. 글자를 줄여 맞추지 않고 실측 높이만 쓴다. */
    static int visibleRows(float bodyPx, float rowPx, float gapPx, int itemCount) {
        if (rowPx <= 0) return 0;
        int fits = (int) ((bodyPx + gapPx) / (rowPx + gapPx));
        return Math.max(0, Math.min(Math.min(ROW_MAX, itemCount), fits));
    }

    /** 좁거나 글자가 크면 헤더 날짜부터 접는다. 제목과 액션은 남는다. */
    static boolean showsHeaderDate(float widthDp, float fontScale) {
        return widthDp >= HEADER_DATE_WIDTH_DP && fontScale < 1.3f;
    }

    /** 최소 지원 폭 아래에서는 좌측 문구를 접어 48dp 액션이 잘리지 않게 한다. */
    static boolean showsFooterLeft(float widthDp) {
        return widthDp >= FOOTER_LEFT_WIDTH_DP;
    }

    /** 갱신 시각은 정보량이 가장 적은 요소라 폭이 넉넉할 때만 남긴다. */
    static boolean showsFooterMeta(float widthDp, float fontScale) {
        return widthDp >= FOOTER_META_WIDTH_DP && fontScale < 1.3f;
    }

    /** 본문 높이가 필요 높이를 감당하는지. 아이콘·보조문구·제목 줄 수를 이 판정으로 접는다. */
    static boolean fitsInBody(float bodyPx, float neededPx) {
        return bodyPx >= neededPx;
    }

    /** 실제 TextView 한 줄 높이. includeFontPadding 과 한국어 대체 폰트 지표가 함께 들어간다. */
    private static float measuredLine(Context context, float sizeSp, boolean medium) {
        TextView probe = probe(context, sizeSp, medium);
        probe.setText("대여 0 아이오닉");
        probe.measure(View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        return probe.getMeasuredHeight();
    }

    /** 주어진 폭에서 실제로 차지하는 높이. 줄 수 상한까지만 센다. */
    private static float measuredText(Context context, CharSequence text, float sizeSp, boolean medium, int maxLines, float widthPx) {
        TextView probe = probe(context, sizeSp, medium);
        probe.setMaxLines(maxLines);
        probe.setEllipsize(TextUtils.TruncateAt.END);
        probe.setText(text);
        probe.measure(View.MeasureSpec.makeMeasureSpec(Math.max(0, (int) widthPx), View.MeasureSpec.AT_MOST), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        return probe.getMeasuredHeight();
    }

    private static TextView probe(Context context, float sizeSp, boolean medium) {
        TextView probe = new TextView(context);
        probe.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        if (medium) probe.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return probe;
    }

    private static Uri link(String key, String value) {
        return new Uri.Builder().scheme("rentalflow").authority("today")
                .appendQueryParameter(key, value)
                .build();
    }

    private static PendingIntent openApp(Context context, int requestCode, Uri uri) {
        Intent intent = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW).setData(uri);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void scheduleTick(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        RentalWidgetStore.Snapshot snapshot = RentalWidgetStore.load(context);
        Calendar next = Calendar.getInstance(snapshot == null ? TimeZone.getDefault() : TimeZone.getTimeZone(snapshot.timeZone));
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 10);
        next.set(Calendar.MILLISECOND, 0);
        next.add(Calendar.DAY_OF_YEAR, 1);
        // ponytail: inexact alarm on purpose, no exact alarm permission needed. A few minutes late is fine because
        // the snapshot time is on screen; upgrade to setExactAndAllowWhileIdle if the day flip ever needs to be sharp.
        alarms.set(AlarmManager.RTC, next.getTimeInMillis(), PendingIntent.getBroadcast(context, 0, new Intent(context, RentalWidgetProvider.class).setAction(ACTION_TICK), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    private static int heightDp(Context context, int appWidgetId) {
        return optionDp(context, appWidgetId, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180);
    }

    /** 위젯이 실제로 받은 높이에서 바깥 여백과 구획 사이 간격을 뺀 나머지. */
    private static float bodyHeightPx(int heightDp, float dp) {
        return heightDp * dp - (INSET_BOTTOM_DP + BAND_PAD_DP * 2 + HEADER_GAP_DP + FOOTER_GAP_DP) * dp;
    }

    private static int widthDp(Context context, int appWidgetId) {
        return optionDp(context, appWidgetId, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
    }

    private static int optionDp(Context context, int appWidgetId, String key, int fallback) {
        Bundle options = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId);
        int value = options == null ? 0 : options.getInt(key, 0);
        return value > 0 ? value : fallback;
    }

    private static String format(String pattern, Date date, Locale locale, TimeZone zone) {
        SimpleDateFormat formatter = new SimpleDateFormat(pattern, locale);
        formatter.setTimeZone(zone);
        return formatter.format(date);
    }
}
