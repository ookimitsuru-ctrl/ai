package com.example.nippo;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONObject;

/** 日付ごとに日報の全項目を保存する。 */
public class Store {
    public static class Entry {
        public final Map<String, String> f;
        public Entry(Map<String, String> f) { this.f = f; }

        public int minutes() {
            String v = f.get(Fields.MINUTES);
            if (v == null) return 0;
            try {
                String[] p = v.split(":");
                return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim());
            } catch (Exception e) { return 0; }
        }

        public int yen() {
            try { return Integer.parseInt(f.get(Fields.INCOME)); } catch (Exception e) { return 0; }
        }
    }

    private final SharedPreferences sp;

    public Store(Context c) { sp = c.getSharedPreferences("nippo", Context.MODE_PRIVATE); }

    public void put(LocalDate d, Entry e) {
        sp.edit().putString(d.toString(), new JSONObject(e.f).toString()).apply();
    }

    public void remove(LocalDate d) { sp.edit().remove(d.toString()).apply(); }

    public Entry get(LocalDate d) {
        String v = sp.getString(d.toString(), null);
        if (v == null) return null;
        Map<String, String> m = new LinkedHashMap<>();
        try {
            if (v.startsWith("{")) {
                JSONObject o = new JSONObject(v);
                for (Fields.F f : Fields.ALL) if (o.has(f.label)) m.put(f.label, o.getString(f.label));
                if (o.has(Fields.OCR)) m.put(Fields.OCR, o.getString(Fields.OCR));
            } else {                                   // 旧形式 "分|円"
                String[] p = v.split("\\|");
                m.put(Fields.MINUTES, Integer.parseInt(p[0]) / 60 + ":" + String.format("%02d", Integer.parseInt(p[0]) % 60));
                m.put(Fields.INCOME, p[1]);
            }
        } catch (Exception ignored) {}
        return new Entry(m);
    }

    /** 最初の記入日(なければ null)。 */
    public LocalDate firstDate() {
        LocalDate first = null;
        for (String k : sp.getAll().keySet()) {
            try {
                LocalDate d = LocalDate.parse(k);
                if (first == null || d.isBefore(first)) first = d;
            } catch (Exception ignored) {}
        }
        return first;
    }

    /** 最初の記入日を 1 とした連番。それより前は 0。 */
    public int serial(LocalDate d) {
        LocalDate first = firstDate();
        if (first == null || d.isBefore(first)) return 0;
        return (int) ChronoUnit.DAYS.between(first, d) + 1;
    }

    public static String fmtTime(int minutes) {
        return (minutes / 60) + ":" + String.format("%02d", minutes % 60);
    }

    public static String fmtYen(int yen) { return String.format("%,d", yen); }
}
