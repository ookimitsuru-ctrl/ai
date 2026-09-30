package com.example.nippo;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;

/** 日ごとの「拘束時間(分)」「営業収入(円)」を保存する。 */
public class Store {
    public static class Entry {
        public final int minutes;
        public final int yen;
        public Entry(int minutes, int yen) { this.minutes = minutes; this.yen = yen; }
    }

    private final SharedPreferences sp;

    public Store(Context c) { sp = c.getSharedPreferences("nippo", Context.MODE_PRIVATE); }

    public void put(LocalDate d, Entry e) {
        sp.edit().putString(d.toString(), e.minutes + "|" + e.yen).apply();
    }

    public void remove(LocalDate d) { sp.edit().remove(d.toString()).apply(); }

    public Entry get(LocalDate d) {
        String v = sp.getString(d.toString(), null);
        if (v == null) return null;
        String[] p = v.split("\\|");
        return new Entry(Integer.parseInt(p[0]), Integer.parseInt(p[1]));
    }

    public static String fmtTime(int minutes) {
        return (minutes / 60) + ":" + String.format("%02d", minutes % 60);
    }

    public static String fmtYen(int yen) { return String.format("%,d", yen); }
}
