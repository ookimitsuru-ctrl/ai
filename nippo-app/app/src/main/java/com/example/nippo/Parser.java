package com.example.nippo;

import android.graphics.Rect;
import com.google.mlkit.vision.text.Text;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** OCR結果から日付と各項目を取り出す。読めなかった項目は含まれない。 */
public class Parser {
    public Integer year, month, day;
    public String raw = "";
    public final Map<String, String> fields = new LinkedHashMap<>();

    private static final Pattern DATE = Pattern.compile("(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日");
    private static final Pattern TIME = Pattern.compile("(\\d{1,2})\\s*[:：;.]\\s*(\\d{2})");
    private static final Pattern NUM = Pattern.compile("\\d{1,3}(?:[,.]\\d{3})+|\\d+");

    public static Parser parse(Text t) {
        Parser p = new Parser();
        p.raw = t.getText();
        Matcher m = DATE.matcher(t.getText());
        if (m.find()) {
            p.year = Integer.parseInt(m.group(1));
            p.month = Integer.parseInt(m.group(2));
            p.day = Integer.parseInt(m.group(3));
        }
        List<Text.Line> lines = new ArrayList<>();
        List<Text.Element> elems = new ArrayList<>();
        for (Text.TextBlock b : t.getTextBlocks())
            for (Text.Line l : b.getLines()) {
                lines.add(l);
                elems.addAll(l.getElements());
            }
        for (Fields.F f : Fields.ALL) {
            String v = valueFor(lines, elems, f);
            if (v == null) continue;
            if (f.type == Fields.TIME) {
                Matcher tm = TIME.matcher(v);
                if (tm.find()) p.fields.put(f.label, Integer.parseInt(tm.group(1)) + ":" + tm.group(2));
            } else {
                Matcher nm = NUM.matcher(v);
                if (nm.find()) p.fields.put(f.label, nm.group().replaceAll("[,.]", ""));
            }
        }
        return p;
    }

    /** ラベルで始まる行を探し、同じ行(または同じ高さで右側)にある値を返す。 */
    private static String valueFor(List<Text.Line> lines, List<Text.Element> elems, Fields.F f) {
        Pattern pat = f.type == Fields.TIME ? TIME : NUM;
        List<String> names = new ArrayList<>();
        names.add(f.label);
        for (String a : f.aliases) names.add(a);
        for (Text.Line l : lines) {
            String s = l.getText().replace(" ", "").replace("　", "");
            String name = null;
            for (String n : names) if (s.startsWith(n)) { name = n; break; }
            if (name == null) continue;
            if (f.label.equals("合計") && s.startsWith("合計金額")) continue;
            String after = s.substring(name.length());
            if (pat.matcher(after).find()) return after;
            Rect r = l.getBoundingBox();
            if (r == null) continue;
            int cy = r.centerY();
            String best = null;
            int bestDx = Integer.MAX_VALUE;
            for (Text.Element e : elems) {
                Rect er = e.getBoundingBox();
                if (er == null || er.left < r.right - 5) continue;
                if (Math.abs(er.centerY() - cy) > r.height() * 0.6) continue;
                if (!pat.matcher(e.getText()).find()) continue;
                int dx = er.left - r.right;
                if (dx < bestDx) { bestDx = dx; best = e.getText(); }
            }
            if (best != null) return best;
        }
        return null;
    }
}
