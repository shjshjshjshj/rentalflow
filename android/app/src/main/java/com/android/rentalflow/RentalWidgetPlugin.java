package com.android.rentalflow;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Hands the web app's today snapshot to the home screen widget. No token is copied and nothing talks to the server. */
@CapacitorPlugin(name = "RentalWidget")
public class RentalWidgetPlugin extends Plugin {

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String locale = call.getString("locale");
        boolean localeChanged = RentalWidgetStore.saveLocale(getContext(), locale);
        String snapshot = call.getString("snapshot");
        if (snapshot != null && snapshot.equals(RentalWidgetStore.stored(getContext()))) {
            if (localeChanged) RentalWidgetProvider.refresh(getContext());
            call.resolve();
            return;
        }
        if (snapshot == null || !RentalWidgetStore.save(getContext(), snapshot)) {
            call.reject("위젯에 표시할 일정 형식이 올바르지 않습니다.");
            return;
        }
        RentalWidgetProvider.refresh(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearSnapshot(PluginCall call) {
        boolean stored = RentalWidgetStore.stored(getContext()) != null;
        RentalWidgetStore.clear(getContext());
        if (stored) RentalWidgetProvider.refresh(getContext());
        call.resolve();
    }
}
