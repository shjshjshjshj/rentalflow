package com.android.rentalflow;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuthPlugin.class);
        registerPlugin(RentalWidgetPlugin.class);
        registerPlugin(RentalLocalePlugin.class);
        registerPlugin(RentalCalendarPlugin.class);
        super.onCreate(savedInstanceState);
        // 앱을 업데이트해도 WebView 가 이전 번들을 캐시에서 계속 쓰는 경우가 있어, 버전이 바뀌면 한 번 비우고 다시 읽는다.
        // onCreate 전에 WebView 를 만들면 스플래시 잔상이 화면 위에 남으므로, 브리지가 준비된 뒤에 처리한다.
        if (versionChanged(this)) {
            WebView webView = getBridge().getWebView();
            webView.clearCache(true);
            webView.reload();
        }
    }

    /** 버전이 바뀐 첫 실행이면 true 를 돌려주고 기록한다. HTTP 캐시만 지우므로 저장한 데이터는 그대로 남는다. */
    private static boolean versionChanged(Context context) {
        long installed;
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            installed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        } catch (PackageManager.NameNotFoundException missing) {
            return false;
        }
        SharedPreferences prefs = context.getSharedPreferences("rentalflow-cache", Context.MODE_PRIVATE);
        if (prefs.getLong("version", -1L) == installed) return false;
        prefs.edit().putLong("version", installed).apply();
        return true;
    }
}

