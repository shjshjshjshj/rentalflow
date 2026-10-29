package com.android.rentalflow;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** 앱 언어 선택 → OS 앱별 언어 태그 매핑. system/모르는 값은 override 를 쓰지 않는다(null). */
public class RentalLocaleTest {

    @Test
    public void mapsThePickerToAnAppLocaleTag() {
        assertEquals("ko", RentalLocalePlugin.preferenceTag("ko"));
        assertEquals("en", RentalLocalePlugin.preferenceTag("en"));
        assertEquals("id", RentalLocalePlugin.preferenceTag("id"));
        assertEquals("vi", RentalLocalePlugin.preferenceTag("vi"));
        assertEquals("th", RentalLocalePlugin.preferenceTag("th"));
        assertEquals("ms", RentalLocalePlugin.preferenceTag("ms"));
        assertNull("system 은 override 를 지운다", RentalLocalePlugin.preferenceTag("system"));
        assertNull(RentalLocalePlugin.preferenceTag(null));
        assertNull(RentalLocalePlugin.preferenceTag(""));
        assertNull("지원하지 않는 언어는 override 를 쓰지 않는다", RentalLocalePlugin.preferenceTag("fr"));
    }
}
