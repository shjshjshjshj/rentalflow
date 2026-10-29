package com.android.rentalflow;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RemoteViews;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Debug-only renderer (never in a release build). Draws the widget's real RemoteViews offscreen at the exact dp size
 * the launcher reports, checks clipping on all four edges plus text-line clipping, saves each card as a PNG and shows
 * it scaled on screen. Nothing here touches production data or the user's session.
 * Launch: adb shell am start -n com.team226.rentalflow/com.android.rentalflow.WidgetPreviewActivity
 */
public class WidgetPreviewActivity extends Activity {

    private static final String TAG = "WidgetPreview";

    /** 기기 실측 폭 376dp(4x2)와 지원 최소 180dp, 판정 대조군 60dp. */
    private static final int[][] SIZES = {
        { 376, 212 },
        { 376, 310 },
        { 376, 180 },
        { 376, 176 },
        { 180, 180 },
        { 376, 60 },
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int inset = dp(12);
        root.setPadding(inset, inset, inset, inset);
        root.addView(note("fontScale=" + getResources().getConfiguration().fontScale + " · density=" + getResources().getDisplayMetrics().density + " · 오프스크린 1:1 렌더(화면에는 축소 표시)"));
        String budget = "실측 한 줄 높이: 17sp " + probe(17, true) + "px · 15sp " + probe(15, true) + "px · 12sp " + probe(12, false) + "px · 11sp " + probe(11, false) + "px";
        root.addView(note(budget));
        Log.i(TAG, budget);
        for (int[] size : SIZES) {
            root.addView(heading(size[0] + "x" + size[1] + "dp" + sizeNote(size[0], size[1])));
            for (Case scenario : cases()) add(root, scenario, size[0], size[1]);
        }
        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
    }

    private static String sizeNote(int widthDp, int heightDp) {
        if (heightDp == 60) return " · 판정 대조군(넘침이 나와야 정상)";
        if (heightDp == 176) return " · 기기 2줄 실측(376x176.7)";
        if (widthDp == 180) return " · 지원 최소 폭+높이";
        if (heightDp == 212) return " · 기본 4x2 실측";
        if (heightDp == 310) return " · 세로 확장";
        return " · 지원 최소 높이";
    }

    private static final class Case {
        final String label;
        final RentalWidgetStore.Snapshot snapshot;

        Case(String label, RentalWidgetStore.Snapshot snapshot) {
            this.label = label;
            this.snapshot = snapshot;
        }
    }

    private List<Case> cases() {
        List<Case> scenarios = new ArrayList<>();
        scenarios.add(new Case("connect", null));
        scenarios.add(new Case("onboarding", RentalWidgetStore.Snapshot.onboarding()));
        scenarios.add(new Case("empty", ready(dayKey(0), 0, 0, new ArrayList<RentalWidgetStore.Item>(), clock(0, 15, 32))));
        List<RentalWidgetStore.Item> today = new ArrayList<>();
        today.add(new RentalWidgetStore.Item("preview-rental-1", clock(0, 15, 0), true, "아반떼 01"));
        today.add(new RentalWidgetStore.Item("preview-return-1", clock(0, 16, 30), false, "아이오닉 5"));
        today.add(new RentalWidgetStore.Item("preview-rental-2", clock(0, 18, 0), true, "K5 03"));
        scenarios.add(new Case("today-2rental-1return", ready(dayKey(0), 2, 1, today, clock(0, 15, 32))));
        scenarios.add(new Case("stale-yesterday", ready(dayKey(-1), 2, 1, new ArrayList<>(today), clock(-1, 9, 12))));
        return scenarios;
    }

    private static RentalWidgetStore.Snapshot ready(String day, int rentals, int returns, List<RentalWidgetStore.Item> items, long updatedAt) {
        return new RentalWidgetStore.Snapshot(false, day, updatedAt, rentals, returns, items);
    }

    private static String dayKey(int offsetDays) {
        Calendar calendar = Calendar.getInstance();
        calendar.add(Calendar.DAY_OF_YEAR, offsetDays);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
    }

    private static long clock(int offsetDays, int hour, int minute) {
        Calendar calendar = Calendar.getInstance();
        calendar.add(Calendar.DAY_OF_YEAR, offsetDays);
        calendar.set(Calendar.HOUR_OF_DAY, hour);
        calendar.set(Calendar.MINUTE, minute);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar.getTimeInMillis();
    }

    private void add(LinearLayout parent, Case scenario, int widthDp, int heightDp) {
        int widthPx = dp(widthDp);
        int heightPx = dp(heightDp);
        View card = RentalWidgetProvider.render(this, scenario.snapshot, heightDp, widthDp).apply(this, null);
        card.measure(View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(heightPx, View.MeasureSpec.EXACTLY));
        card.layout(0, 0, widthPx, heightPx);
        String report = inspect(card, widthPx, heightPx);
        Bitmap bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        card.draw(new Canvas(bitmap));
        save(scenario.label + "-" + widthDp + "x" + heightDp + "dp.png", bitmap);
        String line = report + " · " + scenario.label + " " + widthDp + "x" + heightDp + "dp";
        Log.i(TAG, line);
        parent.addView(status(line, report.startsWith("잘림 없음")));
        ImageView image = new ImageView(this);
        image.setImageBitmap(bitmap);
        image.setAdjustViewBounds(true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(10);
        parent.addView(image, params);
    }

    /** 네 방향 넘침 + TextView 줄 잘림을 실제 layout 결과로만 판정한다. */
    private String inspect(View root, int widthPx, int heightPx) {
        int[] overflow = { 0 };
        String[] where = { "" };
        int[] textClip = { 0 };
        String[] textWhere = { "" };
        int[] ellipsis = { 0 };
        String[] ellipsisWhere = { "" };
        scan(root, 0, 0, widthPx, heightPx, overflow, where, textClip, textWhere, ellipsis, ellipsisWhere);
        float density = getResources().getDisplayMetrics().density;
        StringBuilder builder = new StringBuilder();
        if (overflow[0] > 0) builder.append(String.format(Locale.US, "넘침 %s %.1fdp", where[0], overflow[0] / density));
        if (textClip[0] > 0) {
            if (builder.length() > 0) builder.append(" · ");
            builder.append(String.format(Locale.US, "줄 잘림 %s %.1fdp", textWhere[0], textClip[0] / density));
        }
        // 넘침이 없어도 말줄임은 뜻이 사라진 것이므로 함께 보고한다(행 상품명 말줄임은 설계된 동작).
        if (ellipsis[0] > 0) {
            if (builder.length() > 0) builder.append(" · ");
            builder.append("말줄임 ").append(ellipsisWhere[0]).append(" ").append(ellipsis[0]).append("줄");
        }
        return builder.length() == 0 ? "잘림 없음" : builder.toString();
    }

    private void scan(View view, int left, int top, int right, int bottom, int[] overflow, String[] where, int[] textClip, String[] textWhere, int[] ellipsis, String[] ellipsisWhere) {
        if (view.getVisibility() == View.GONE) return;
        int viewLeft = left + view.getLeft();
        int viewTop = top + view.getTop();
        int viewRight = left + view.getRight();
        int viewBottom = top + view.getBottom();
        if (view != view.getRootView()) {
            int over = Math.max(Math.max(left - viewLeft, viewRight - right), Math.max(top - viewTop, viewBottom - bottom));
            if (over > overflow[0]) {
                overflow[0] = over;
                where[0] = viewBottom > bottom ? "bottom" : viewRight > right ? "right" : viewLeft < left ? "left" : "top";
            }
        }
        if (view instanceof TextView) {
            TextView text = (TextView) view;
            if (text.getLayout() != null) {
                int available = text.getHeight() - text.getPaddingTop() - text.getPaddingBottom();
                int clipped = text.getLayout().getHeight() - available;
                if (clipped > textClip[0]) {
                    textClip[0] = clipped;
                    textWhere[0] = name(text);
                }
                for (int line = 0; line < text.getLayout().getLineCount(); line++) {
                    if (text.getLayout().getEllipsisCount(line) > 0) {
                        ellipsis[0]++;
                        ellipsisWhere[0] = name(text);
                        break;
                    }
                }
            }
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                scan(group.getChildAt(index), viewLeft, viewTop, viewRight, viewBottom, overflow, where, textClip, textWhere, ellipsis, ellipsisWhere);
            }
        }
    }

    private String name(TextView text) {
        int id = text.getId();
        return id == View.NO_ID ? text.getClass().getSimpleName() : getResources().getResourceEntryName(id);
    }

    private void save(String name, Bitmap bitmap) {
        File directory = new File(getExternalFilesDir(null), "widget-preview");
        if (!directory.exists() && !directory.mkdirs()) return;
        try (FileOutputStream stream = new FileOutputStream(new File(directory, name))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
        } catch (Exception error) {
            Log.w(TAG, "저장 실패 " + name, error);
        }
    }

    private TextView heading(String text) {
        TextView view = note(text);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        view.setPadding(0, dp(14), 0, dp(4));
        return view;
    }

    private TextView status(String text, boolean fine) {
        TextView view = note(text);
        view.setTextColor(fine ? 0xFF176B50 : 0xFFA52A2A);
        view.setPadding(0, dp(6), 0, dp(4));
        return view;
    }

    private TextView note(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        return view;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    /** 위젯 예산이 쓰는 것과 같은 방식으로 한 줄 높이를 재어 화면에 남긴다(보고용). */
    private int probe(int sizeSp, boolean medium) {
        TextView view = new TextView(this);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        if (medium) view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        view.setText("대여 0 아이오닉");
        view.measure(View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        return view.getMeasuredHeight();
    }
}
