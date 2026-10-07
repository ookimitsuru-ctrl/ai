package com.example.nippo;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 複数回の読み取り結果をまとめ、拘束時間と営業収入を検算して決める。
 *
 * 拘束時間 = 帰庫時間 − 出庫時間 = ハンドル時間 + 全休憩時間
 * 営業収入 = 合計 − 税金額、 合計 = 運賃 + 料金、 税金額 ≒ 合計 ÷ 11
 */
public class Reader {
    public static final int WARN = 0, OK_READ = 1, OK_CALC = 2;

    public static class Check {
        public String value;      // 拘束時間 "h:mm" / 営業収入 "円(数字のみ)"。決められなければ null
        public int level = WARN;
        public String note = "";
    }

    public static class Result {
        public Integer year, month, day;
        public String raw = "";
        public final Map<String, String> fields = new LinkedHashMap<>();
        public Check kousoku = new Check(), income = new Check();
    }

    private static class Ev {
        final long value; final String kind; final int pass;
        Ev(long value, String kind, int pass) { this.value = value; this.kind = kind; this.pass = pass; }
    }

    static final String READ = "読み取り";

    public static Result empty() {
        Result r = new Result();
        r.kousoku.note = "⚠ 読み取れませんでした";
        r.income.note = "⚠ 読み取れませんでした";
        return r;
    }

    public static Result combine(List<Parser> passes) {
        Result r = new Result();
        for (Parser p : passes)
            if (p.year != null) { r.year = p.year; r.month = p.month; r.day = p.day; break; }
        if (!passes.isEmpty()) r.raw = passes.get(0).raw;

        // 各項目: 多数決(同数なら後の読み取り=切り出して拡大した方を優先)
        for (Fields.F f : Fields.ALL) {
            Map<String, Integer> cnt = new LinkedHashMap<>();
            String best = null;
            int bestN = 0;
            for (Parser p : passes) {
                String v = p.fields.get(f.label);
                if (v == null) continue;
                int n = cnt.merge(v, 1, Integer::sum);
                if (n >= bestN) { bestN = n; best = v; }
            }
            if (best != null) r.fields.put(f.label, best);
        }

        List<Map<String, String>> sources = new ArrayList<>();
        for (Parser p : passes) sources.add(p.fields);
        sources.add(r.fields);   // 読み取りをまたいだ組み合わせ用

        r.kousoku = decide(kousokuEvidence(sources), true);
        r.income = decide(incomeEvidence(sources), false);
        if (r.kousoku.value != null) r.fields.put(Fields.MINUTES, r.kousoku.value);
        if (r.income.value != null) r.fields.put(Fields.INCOME, r.income.value);
        return r;
    }

    // ---- 拘束時間 ----
    private static List<Ev> kousokuEvidence(List<Map<String, String>> src) {
        List<Ev> ev = new ArrayList<>();
        int last = src.size() - 1;
        for (int i = 0; i < src.size(); i++) {
            Map<String, String> f = src.get(i);
            Integer k = min(f.get("拘束時間")), out = min(f.get("出庫時間")), in = min(f.get("帰庫時間"));
            Integer hd = min(f.get("ハンドル時間")), rest = min(f.get("全休憩時間"));
            if (k != null && i != last) add(ev, k, READ, i, 30, 24 * 60);
            if (out != null && in != null) add(ev, in - out, "帰庫−出庫", i, 30, 24 * 60);
            if (hd != null && rest != null) add(ev, hd + rest, "ハンドル+休憩", i, 30, 24 * 60);
        }
        return ev;
    }

    // ---- 営業収入 ----
    private static List<Ev> incomeEvidence(List<Map<String, String>> src) {
        List<Ev> ev = new ArrayList<>();
        int last = src.size() - 1;
        for (int i = 0; i < src.size(); i++) {
            Map<String, String> f = src.get(i);
            Long inc = num(f.get("営業収入")), total = num(f.get("合計")), tax = num(f.get("税金額"));
            Long fare = num(f.get("運賃")), fee = num(f.get("料金"));
            Long fareTotal = fare != null && fee != null ? fare + fee : null;
            if (inc != null && i != last) {
                add(ev, inc, READ, i, 0, 2_000_000);
                // 合計の約 10/11 になっているか(税金額が読めなくても確かめられる)
                if (total != null && Math.abs(inc * 11 - total * 10) <= 110) add(ev, inc, "合計×10/11", i, 0, 2_000_000);
            }
            if (total != null && tax != null && taxOk(total, tax)) {
                add(ev, total - tax, "合計−税金額", i, 0, 2_000_000);
                if (total.equals(fareTotal)) add(ev, total - tax, "運賃+料金=合計", i, 0, 2_000_000);
            }
            if (fareTotal != null && tax != null && taxOk(fareTotal, tax) && !fareTotal.equals(total))
                add(ev, fareTotal - tax, "運賃+料金−税金額", i, 0, 2_000_000);
        }
        return ev;
    }

    private static boolean taxOk(long total, long tax) { return Math.abs(tax * 11 - total) <= 110; }

    private static void add(List<Ev> ev, long v, String kind, int pass, long lo, long hi) {
        if (v >= lo && v <= hi) ev.add(new Ev(v, kind, pass));
    }

    /** 根拠の重み。直接の読み取りより、別々の数字どうしの計算が合うことを重く見る。 */
    private static double weight(String kind) {
        switch (kind) {
            case READ: return 1;
            case "合計×10/11": return 1;
            case "運賃+料金=合計": return 1;
            case "合計−税金額": return 3;
            case "運賃+料金−税金額": return 2;
            default: return 1.2;   // 帰庫−出庫、ハンドル+休憩
        }
    }

    /** それだけで検算済みとみなせる根拠(税金額が合計の約1/11になっている)。 */
    private static boolean selfVerified(String kind) {
        return kind.equals("合計−税金額") || kind.equals("運賃+料金−税金額");
    }

    private static Check decide(List<Ev> ev, boolean time) {
        Check c = new Check();
        // 値ごとの根拠(種類)と件数
        Map<Long, Set<String>> kinds = new LinkedHashMap<>();
        Map<Long, Integer> reads = new LinkedHashMap<>();
        for (Ev e : ev) {
            kinds.computeIfAbsent(e.value, k -> new LinkedHashSet<>()).add(e.kind);
            if (e.kind.equals(READ)) reads.merge(e.value, 1, Integer::sum);
        }
        if (kinds.isEmpty()) {
            c.note = "⚠ 読み取れませんでした。写真の値を入力してください";
            return c;
        }
        Long best = null;
        double bestScore = -1;
        for (Map.Entry<Long, Set<String>> e : kinds.entrySet()) {
            long v = e.getKey();
            double score = 0;
            for (String kd : e.getValue()) score += weight(kd);
            score += Math.max(0, reads.getOrDefault(v, 0) - 1) * 0.5;      // 2回とも同じ読み取り
            score += e.getValue().size() * 0.01;                          // 同点なら根拠の種類が多い方
            if (score > bestScore) { bestScore = score; best = v; }
        }
        Set<String> k = kinds.get(best);
        c.value = time ? Store.fmtTime((int) (long) best) : String.valueOf(best);
        List<String> others = new ArrayList<>();
        for (Long v : kinds.keySet())
            if (!v.equals(best)) others.add(time ? Store.fmtTime((int) (long) v) : Store.fmtYen((int) (long) v));

        Set<String> calc = new LinkedHashSet<>(k);
        calc.remove(READ);
        boolean self = false;
        for (String kd : k) self |= selfVerified(kd);
        if (k.size() >= 2 || self) {
            c.level = OK_CALC;
            c.note = "✔ 検算一致(" + String.join("・", calc) + ")";
        } else if (reads.getOrDefault(best, 0) >= 2) {
            c.level = OK_READ;
            c.note = "✔ 2回の読み取りで一致(検算はできませんでした)";
        } else {
            c.level = WARN;
            c.note = "⚠ 要確認: " + (k.contains(READ) ? "検算できませんでした" : "読み取れず、" + String.join("・", calc) + "で計算");
        }
        if (!others.isEmpty() && c.level != OK_CALC) c.note += "(他の候補: " + String.join(" / ", others) + ")";
        return c;
    }

    private static Integer min(String hm) {
        if (hm == null) return null;
        try {
            String[] p = hm.split(":");
            return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
        } catch (Exception e) { return null; }
    }

    private static Long num(String s) {
        if (s == null) return null;
        try { return Long.parseLong(s); } catch (Exception e) { return null; }
    }
}
