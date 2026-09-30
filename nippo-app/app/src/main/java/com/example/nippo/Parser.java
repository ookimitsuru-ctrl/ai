package com.example.nippo;

import android.graphics.Rect;
import com.google.mlkit.vision.text.Text;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** OCR結果から 日付・拘束時間・営業収入 を取り出す。読めなかった項目は null。 */
public class Parser {
    public Integer year, month, day;
    public Integer minutes;
    public Integer yen;

    private static final Pattern DATE = Pattern.compile("(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日");
    private static final Pattern TIME = Pattern.compile("(\\d{1,2})\\s*[:：;.]\\s*(\\d{2})");
    private static final Pattern NUM = Pattern.compile("\\d{1,3}(?:[,.]\\d{3})+|\\d+");

    public static Parser parse(Text t) {
        Parser p = new Parser();
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
        String v = valueFor(lines, elems, "拘束時間", TIME);
        if (v != null) {
            Matcher tm = TIME.matcher(v);
            if (tm.find()) p.minutes = Integer.parseInt(tm.group(1)) * 60 + Integer.parseInt(tm.group(2));
        }
        v = valueFor(lines, elems, "営業収入", NUM);
        if (v != null) {
            Matcher nm = NUM.matcher(v);
            if (nm.find()) p.yen = Integer.parseInt(nm.group().replaceAll("[,.]", ""));
        }
        return p;
    }

    /** ラベルを含む行を探し、同じ行(または同じ高さで右側)にある値を返す。 */
    private static String valueFor(List<Text.Line> lines, List<Text.Element> elems, String label, Pattern pat) {
        for (Text.Line l : lines) {
            if (!l.getText().replace(" ", "").contains(label)) continue;
            String s = l.getText().replace(" ", "");
            String after = s.substring(s.indexOf(label) + label.length());
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
