package com.android.rentalflow;

import android.content.res.Configuration;
import android.content.res.Resources;
import android.os.Build;
import android.os.LocaleList;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * Android 앱별 언어(API 33+)를 웹 앱의 언어 선택과 맞춘다.
 *
 * <p>웹 앱의 저장된 선택이 원본이고, 선택이 바뀌면 {@link #setAppLocale} 로 OS 에 밀어 넣는다. OS 설정에서
 * 바꾼 값은 {@link #getAppLocale} 로 읽어 웹 앱이 채택한다. 위젯은 자체 저장값으로 그리므로 위젯 스냅샷에
 * 실린 언어로 OS 언어를 강제하지 않는다(강제하면 system 선택이 특정 언어로 고정된다).
 *
 * <p>API 33 미만에는 플랫폼 앱별 언어가 없다. 그때는 앱 화면과 위젯만 선택을 따르고, 알림 채널 이름처럼
 * OS 가 그리는 표면은 시스템 언어를 따른다.
 */
@CapacitorPlugin(name = "RentalLocale")
public class RentalLocalePlugin extends Plugin {

    /** 앱에서 고른 선택(system/ko/en)을 OS 앱 언어 태그로 바꾼다. null 이면 앱별 언어를 쓰지 않는다. */
    static String preferenceTag(String preference) {
        return "ko".equals(preference) || "en".equals(preference) || "id".equals(preference) || "vi".equals(preference) || "th".equals(preference) || "ms".equals(preference) ? preference : null;
    }

    /** 앱별 언어를 고른 적이 없으면 tag 가 null 이고, system 은 앱별 언어와 무관한 기기 언어다. */
    @PluginMethod
    public void getAppLocale(PluginCall call) {
        JSObject state = localeState();
        // 지원 문의에 쓸 수 있게 고른 값과 기기 언어를 남긴다(언어 태그만, 개인정보 없음).
        Log.i("RentalFlow", "app locale " + state.getString("tag") + " / device " + state.getString("system"));
        call.resolve(state);
    }

    /**
     * 앱에서 고른 언어를 OS 에 반영한다. system 이면 override 를 지워 기기 언어를 따르게 한다.
     * locale 이 activity 의 configChanges 에 있어 화면이 다시 만들어지지 않으므로 작성 중 입력이 남는다.
     */
    @PluginMethod
    public void setAppLocale(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            android.app.LocaleManager manager = getContext().getSystemService(android.app.LocaleManager.class);
            if (manager != null) {
                String tag = preferenceTag(call.getString("preference", "system"));
                manager.setApplicationLocales(tag == null ? LocaleList.getEmptyLocaleList() : LocaleList.forLanguageTags(tag));
            }
        }
        call.resolve();
    }

    /** OS 설정에서 언어를 바꾸면 activity 재생성 없이 여기로 들어온다(manifest 의 configChanges=locale). */
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        notifyListeners("localeChanged", localeState());
    }

    private JSObject localeState() {
        JSObject state = new JSObject();
        state.put("tag", appLocaleTag());
        state.put("system", systemLanguageTag());
        state.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU);
        return state;
    }

    /**
     * 기기 언어(앱별 언어와 무관). 삼성 등 일부 기기에서는 앱별 언어가 {@link Resources#getSystem()} 에도
     * 반영되어 "시스템 기본"이 고른 언어로 굳는다. 그래서 앱별 언어가 건드리지 못하는 system_locales 설정을
     * 먼저 보고, 읽지 못할 때만 시스템 리소스와 프로세스 기본값으로 내려간다.
     */
    private String systemLanguageTag() {
        try {
            String setting = Settings.System.getString(getContext().getContentResolver(), "system_locales");
            if (setting != null && !setting.trim().isEmpty()) return setting.split(",")[0].trim();
        } catch (Exception ignored) { /* 설정을 읽지 못하면 다음 근거로 내려간다. */ }
        LocaleList system = Resources.getSystem().getConfiguration().getLocales();
        return system.isEmpty() ? Locale.getDefault().toLanguageTag() : system.get(0).toLanguageTag();
    }

    private String appLocaleTag() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return null;
        android.app.LocaleManager manager = getContext().getSystemService(android.app.LocaleManager.class);
        if (manager == null) return null;
        LocaleList locales = manager.getApplicationLocales();
        return locales.isEmpty() ? null : locales.get(0).toLanguageTag();
    }
}
