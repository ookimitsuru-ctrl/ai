package com.example.nippo;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 日報1枚分のOCR結果から日付と各項目を取り出す。読めなかった項目は含まれない。
 *
 * 日報の左欄は Fields.ALL の先頭 LEFT_COUNT 項目が上から順に等間隔で並ぶ。
 * ラベルが誤読されても、読めたラベルの並び(番号と高さ)から各行の位置を推定し、
 * 右揃えの値の列から値を拾う。
 */
public class Parser {
    public Integer year, month, day;
    public String raw = "";
    public final Map<String, String> fields = new LinkedHashMap<>();
    /** 左欄の範囲(2回目の読み取りで切り出す領域)。推定できなければ null。 */
    public OcrPage.Box leftColumn;
    /** 文字の高さ(px)。不明なら 0。 */
    public float charHeight;

    static final int LEFT_COUNT = 26;

    private static final Pattern DATE = Pattern.compile("(\\d{4})年(\\d{1,2})月(\\d{1,2})日");
    private static final Pattern TIME = Pattern.compile("(\\d{1,2})[:;.,・'’`](\\d{2})(?!\\d)");
    private static final Pattern TIME_NOSEP = Pattern.compile("(?<!\\d)(\\d{3,4})(?!\\d)");
    private static final Pattern NUM = Pattern.compile("\\d{1,3}(?:[,.]\\d{3})+(?!\\d)|\\d+");

    private static class Label {
        final int idx; final OcrPage.Box box; final int dist;
        Label(int idx, OcrPage.Box box, int dist) { this.idx = idx; this.box = box; this.dist = dist; }
    }

    private static class Run {
        final String text; final OcrPage.Box box; final int numRight;
        Run(String text, OcrPage.Box box, int numRight) { this.text = text; this.box = box; this.numRight = numRight; }
    }

    public static Parser parse(OcrPage page) {
        Parser p = new Parser();
        p.run(page);
        return p;
    }

    private void run(OcrPage page) {
        raw = page.text == null ? "" : page.text;
        Matcher m = DATE.matcher(norm(raw));
        if (m.find()) {
            year = Integer.parseInt(m.group(1));
            month = Integer.parseInt(m.group(2));
            day = Integer.parseInt(m.group(3));
        }

        List<OcrPage.Word> words = new ArrayList<>();
        for (OcrPage.Line l : page.lines) {
            if (l.words.isEmpty()) words.add(new OcrPage.Word(l.text, l.box));
            else words.addAll(l.words);
        }
        List<Label> labels = findLabels(page);

        // ---- 左欄: 文字の高さ・左端・行の並び(y = a + b*番号) ----
        List<Label> left = new ArrayList<>();
        for (Label lb : labels) if (lb.idx < LEFT_COUNT) left.add(lb);
        List<Float> hs = new ArrayList<>();
        for (Label lb : left) hs.add((float) lb.box.h());
        if (hs.isEmpty()) for (OcrPage.Word w : words) hs.add((float) w.box.h());
        charHeight = hs.isEmpty() ? 0 : median(hs);
        float ch = Math.max(charHeight, 1);

        float refLeft = 0;
        if (!left.isEmpty()) {
            List<Float> xs = new ArrayList<>();
            for (Label lb : left) if (lb.dist == 0) xs.add((float) lb.box.l);
            if (xs.isEmpty()) for (Label lb : left) xs.add((float) lb.box.l);
            refLeft = median(xs);
            List<Label> keep = new ArrayList<>();
            for (Label lb : left) if (Math.abs(lb.box.l - refLeft) <= 8 * ch) keep.add(lb);
            left = keep;
        }
        float[] ab = fit(left);
        Map<Integer, Label> anchors = new HashMap<>();
        if (ab != null) {
            float a = ab[0], b = ab[1];
            Map<Integer, Float> bestRes = new HashMap<>();
            for (Label lb : left) {
                float res = Math.abs(lb.box.cy() - (a + b * lb.idx));
                if (res > 0.45f * b) continue;
                Float prev = bestRes.get(lb.idx);
                if (prev == null || res < prev) { bestRes.put(lb.idx, res); anchors.put(lb.idx, lb); }
            }
            float[] ab2 = fit(new ArrayList<>(anchors.values()));
            if (ab2 != null) ab = ab2;
        } else {
            // 並びが推定できないときは、ラベルごとに単独で使う(重複は最初のもの)
            for (Label lb : left) if (!anchors.containsKey(lb.idx)) anchors.put(lb.idx, lb);
        }

        // ---- 写真の傾き: 左揃えのラベルの左端の並び(または OCR が返す行の角度)から求める ----
        float colSlope = columnSlope(new ArrayList<>(anchors.values()), ch);   // 縦の列の dx/dy
        if (Float.isNaN(colSlope)) {
            // ラベルが少なくて求まらないときは、OCR が返す行の角度を使う
            List<Float> angles = new ArrayList<>();
            for (OcrPage.Line l : page.lines)
                if (!Float.isNaN(l.angle) && norm(l.text).length() >= 3 && Math.abs(l.angle) < 20) angles.add(l.angle);
            colSlope = angles.size() >= 5 ? (float) -Math.tan(Math.toRadians(median(angles))) : 0;
        }
        float skew = -colSlope;                                                // 横の行の dy/dx

        // ---- 1段目: 読めたラベルの右側の値(値の列の位置を求める) ----
        List<Float> rights = new ArrayList<>();
        Map<Integer, Run> found = new HashMap<>();
        for (Label lb : anchors.values()) {
            Run r = nearestRight(words, lb, ch, skew);
            if (r == null) continue;
            found.put(lb.idx, r);
            rights.add(r.numRight - colSlope * r.box.cy());       // 傾きを除いた右端
        }
        Float valueRight0 = rights.size() >= 3 ? median(rights) : null;

        // ---- 2段目: 全行について、推定した行の高さ×値の列で値を拾い直す ----
        if (ab != null || !anchors.isEmpty()) {
            for (int i = 0; i < LEFT_COUNT; i++) {
                Label lb = anchors.get(i);
                if (lb == null && ab == null) continue;
                float baseY = lb != null ? lb.box.cy() : ab[0] + ab[1] * i;
                float x0 = lb != null ? lb.box.cx() : refLeft + ch;
                float startX = lb != null ? lb.box.r - 0.3f * ch : refLeft + 1.5f * ch;
                float tol = ab != null ? 0.42f * ab[1] : 0.6f * ch;
                Run best = null;
                float bestScore = Float.MAX_VALUE;
                for (Run r : rowRuns(words, baseY, x0, skew, tol, startX, lb, ch)) {
                    if (parseValue(Fields.ALL[i], r.text) == null) continue;
                    float score;
                    if (valueRight0 != null) {
                        score = Math.abs(r.numRight - (valueRight0 + colSlope * r.box.cy()));
                        if (score > 3 * ch) continue;
                    } else {
                        score = r.box.l - startX;
                        if (score > 22 * ch) continue;
                    }
                    if (score < bestScore) { bestScore = score; best = r; }
                }
                if (best != null) found.put(i, best);
                else if (valueRight0 != null && found.containsKey(i)
                        && Math.abs(found.get(i).numRight - (valueRight0 + colSlope * found.get(i).box.cy())) > 3 * ch)
                    found.remove(i);
            }
        }
        for (Map.Entry<Integer, Run> e : found.entrySet()) {
            String v = parseValue(Fields.ALL[e.getKey()], e.getValue().text);
            if (v != null) fields.put(Fields.ALL[e.getKey()].label, v);
        }

        // ---- 左欄以外(運転診断など): ラベルの右隣 ----
        for (Label lb : labels) {
            if (lb.idx < LEFT_COUNT || fields.containsKey(Fields.ALL[lb.idx].label)) continue;
            Run r = nearestRight(words, lb, Math.max(lb.box.h(), 1), 0);
            if (r == null) continue;
            String v = parseValue(Fields.ALL[lb.idx], r.text);
            if (v != null) fields.put(Fields.ALL[lb.idx].label, v);
        }

        // ---- 2回目の読み取り用の切り出し範囲 ----
        if (ab != null) {
            float a = ab[0], b = ab[1];
            float l = refLeft - 1.5f * ch;
            float midY = a + b * (LEFT_COUNT - 1) / 2f;
            float r = valueRight0 != null ? valueRight0 + colSlope * midY + 4 * ch : refLeft + 25 * ch;
            l -= Math.abs(colSlope) * b * LEFT_COUNT / 2f;
            r += Math.abs(colSlope) * b * LEFT_COUNT / 2f;
            float extra = Math.abs(skew) * (r - l);
            float t = a - 1.3f * b - extra, bo = a + b * (LEFT_COUNT - 1) + 1.3f * b + extra;
            leftColumn = new OcrPage.Box(Math.round(l), Math.round(t), Math.round(r), Math.round(bo));
        }
    }

    /** ラベルの右側で、同じ行にある最初の(値として読める)かたまり。 */
    private static Run nearestRight(List<OcrPage.Word> words, Label lb, float ch, float skew) {
        float tol = 0.6f * Math.max(lb.box.h(), ch);
        Run best = null;
        for (Run r : rowRuns(words, lb.box.cy(), lb.box.cx(), skew, tol, lb.box.r - 0.3f * ch, lb, ch)) {
            if (parseValue(Fields.ALL[lb.idx], r.text) == null) continue;
            if (r.box.l - lb.box.r > 22 * ch) continue;
            if (best == null || r.box.l < best.box.l) best = r;
        }
        return best;
    }

    /** 指定した行にある単語を左から並べ、近いものどうしをまとめる。 */
    private static List<Run> rowRuns(List<OcrPage.Word> words, float baseY, float x0, float skew, float tol,
                                     float startX, Label lb, float ch) {
        List<OcrPage.Word> row = new ArrayList<>();
        for (OcrPage.Word w : words) {
            if (w.box.cx() < startX) continue;
            if (lb != null && w.box.cx() <= lb.box.r && w.box.cx() >= lb.box.l
                    && Math.abs(w.box.cy() - lb.box.cy()) < lb.box.h()) continue;   // ラベル自身
            float y = baseY + skew * (w.box.cx() - x0);
            if (Math.abs(w.box.cy() - y) <= tol) row.add(w);
        }
        Collections.sort(row, (p, q) -> Integer.compare(p.box.l, q.box.l));
        List<Run> runs = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        OcrPage.Box box = null;
        int numRight = -1;
        for (OcrPage.Word w : row) {
            if (box != null && w.box.l - box.r > 1.0f * ch) {
                runs.add(new Run(sb.toString(), box, numRight < 0 ? box.r : numRight));
                sb.setLength(0); box = null; numRight = -1;
            }
            String n = norm(w.text);
            sb.append(n);
            box = w.box.union(box);
            if (hasDigit(fixDigits(n))) numRight = w.box.r;
        }
        if (box != null) runs.add(new Run(sb.toString(), box, numRight < 0 ? box.r : numRight));
        return runs;
    }

    // ---- ラベル ----
    private static List<Label> findLabels(OcrPage page) {
        List<Label> out = new ArrayList<>();
        for (OcrPage.Line line : page.lines) {
            List<OcrPage.Word> ws = line.words.isEmpty()
                    ? Collections.singletonList(new OcrPage.Word(line.text, line.box)) : line.words;
            StringBuilder sb = new StringBuilder();
            OcrPage.Box box = null;
            for (OcrPage.Word w : ws) {
                String n = norm(w.text);
                if (n.isEmpty()) continue;
                int k = firstDigit(n);
                if (k >= 0) {
                    if (k > 0) {
                        sb.append(n, 0, k);
                        int r = w.box.l + Math.round(w.box.w() * (k / (float) n.length()));
                        box = new OcrPage.Box(w.box.l, w.box.t, r, w.box.b).union(box);
                    }
                    break;
                }
                sb.append(n);
                box = w.box.union(box);
            }
            String prefix = trimJunk(sb.toString());
            if (prefix.length() < 2 || box == null) continue;
            int[] mt = match(prefix);
            if (mt != null) out.add(new Label(mt[0], box, mt[1]));
        }
        return out;
    }

    /** 最も近い項目の {番号, 距離}。該当なし・同点は null。 */
    static int[] match(String prefix) {
        String p = prefix.toUpperCase();
        int best = -1, bestD = 99;
        boolean tie = false;
        for (int i = 0; i < Fields.ALL.length; i++) {
            List<String> names = new ArrayList<>();
            names.add(Fields.ALL[i].label);
            Collections.addAll(names, Fields.ALL[i].aliases);
            int d = 99;
            for (String name : names) {
                String nm = name.toUpperCase();
                int dd;
                if (p.equals(nm) || (p.startsWith(nm) && isJunk(p.substring(nm.length())))) dd = 0;
                else {
                    dd = lev(p, nm);
                    int allow = nm.length() >= 6 ? 2 : nm.length() >= 3 ? 1 : 0;
                    if (dd > allow) continue;
                }
                d = Math.min(d, dd);
            }
            if (d == 99) continue;
            if (d < bestD) { best = i; bestD = d; tie = false; }
            else if (d == bestD && i != best) tie = true;
        }
        return best < 0 || tie ? null : new int[]{best, bestD};
    }

    // ---- 値 ----
    static String parseValue(Fields.F f, String s) {
        return f.type == Fields.TIME ? parseTime(s) : parseNum(s);
    }

    static String parseTime(String s) {
        String f = fixDigits(norm(s));
        Matcher m = TIME.matcher(f);
        if (m.find()) {
            int h = Integer.parseInt(m.group(1)), mm = Integer.parseInt(m.group(2));
            if (mm < 60 && h <= 48) return h + ":" + m.group(2);
        }
        m = TIME_NOSEP.matcher(f);
        if (m.find()) {
            int v = Integer.parseInt(m.group(1)), h = v / 100, mm = v % 100;
            if (mm < 60 && h <= 48) return h + ":" + String.format("%02d", mm);
        }
        return null;
    }

    static String parseNum(String s) {
        String f = fixDigits(norm(s));
        Matcher m = NUM.matcher(f);
        if (!m.find()) return null;
        // 区切りのあとが3桁でない(例 "77.40")のは桁の読み落とし。誤った値を使わない
        int e = m.end();
        if (e + 1 < f.length() && (f.charAt(e) == ',' || f.charAt(e) == '.') && Character.isDigit(f.charAt(e + 1))) return null;
        return m.group().replaceAll("[,.]", "").replaceFirst("^0+(?=\\d)", "");
    }

    /** 数字の隣にある、数字と見間違えやすい文字を直す(O→0、l→1、S→5 など)。 */
    static String fixDigits(String s) {
        char[] c = s.toCharArray();
        for (int pass = 0; pass < 2; pass++)
            for (int i = 0; i < c.length; i++) {
                char d = toDigit(c[i]);
                if (d == 0) continue;
                boolean near = (i > 0 && (Character.isDigit(c[i - 1]) || isSep(c[i - 1])))
                        || (i + 1 < c.length && (Character.isDigit(c[i + 1]) || isSep(c[i + 1])));
                if (near) c[i] = d;
            }
        return new String(c);
    }

    private static char toDigit(char c) {
        switch (c) {
            case 'O': case 'o': case '〇': case '○': return '0';
            case 'l': case 'I': case '|': case '!': case 'i': return '1';
            case 'S': case 's': return '5';
            case 'B': return '8';
            case 'Z': case 'z': return '2';
            default: return 0;
        }
    }

    private static boolean isSep(char c) { return c == ':' || c == ',' || c == '.'; }

    // ---- 文字列ユーティリティ ----
    static String norm(String s) {
        return Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFKC).replaceAll("\\s+", "");
    }

    private static boolean hasDigit(String s) { return firstDigit(s) >= 0; }

    private static int firstDigit(String s) {
        for (int i = 0; i < s.length(); i++) if (Character.isDigit(s.charAt(i))) return i;
        return -1;
    }

    private static boolean isJunkChar(char c) {
        return !Character.isLetter(c) || "ー一―‐ｰ".indexOf(c) >= 0;
    }

    private static boolean isJunk(String s) {
        for (int i = 0; i < s.length(); i++) if (!isJunkChar(s.charAt(i))) return false;
        return true;
    }

    private static String trimJunk(String s) {
        int a = 0, b = s.length();
        while (a < b && isJunkChar(s.charAt(a))) a++;
        while (b > a && isJunkChar(s.charAt(b - 1))) b--;
        return s.substring(a, b);
    }

    static int lev(String a, String b) {
        int[] prev = new int[b.length() + 1], cur = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) prev[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            cur[0] = i;
            for (int j = 1; j <= b.length(); j++)
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1),
                        prev[j - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1));
            int[] t = prev; prev = cur; cur = t;
        }
        return prev[b.length()];
    }

    private static float median(List<Float> v) {
        List<Float> s = new ArrayList<>(v);
        Collections.sort(s);
        int n = s.size();
        return n % 2 == 1 ? s.get(n / 2) : (s.get(n / 2 - 1) + s.get(n / 2)) / 2;
    }

    /** ラベルの左端の並びの傾き dx/dy(左揃えの列が写真の傾きで斜めになった分)。求まらなければ NaN。 */
    private static float columnSlope(List<Label> ls, float ch) {
        List<Float> slopes = new ArrayList<>();
        for (int i = 0; i < ls.size(); i++)
            for (int j = i + 1; j < ls.size(); j++) {
                float dy = ls.get(j).box.cy() - ls.get(i).box.cy();
                if (Math.abs(dy) > 4 * ch) slopes.add((ls.get(j).box.l - ls.get(i).box.l) / dy);
            }
        if (slopes.size() < 3) return Float.NaN;
        float s = median(slopes);
        return Math.abs(s) > 0.2f ? Float.NaN : s;
    }

    /** ラベルの番号と高さから y = a + b*番号 を求める(外れ値に強い Theil–Sen)。 */
    private static float[] fit(List<Label> ls) {
        List<Float> slopes = new ArrayList<>();
        for (int i = 0; i < ls.size(); i++)
            for (int j = i + 1; j < ls.size(); j++) {
                int di = ls.get(j).idx - ls.get(i).idx;
                if (di != 0) slopes.add((ls.get(j).box.cy() - ls.get(i).box.cy()) / di);
            }
        if (slopes.isEmpty()) return null;
        float b = median(slopes);
        float ch = 0;
        List<Float> hs = new ArrayList<>();
        for (Label l : ls) hs.add((float) l.box.h());
        ch = median(hs);
        if (b < 0.8f * ch || b > 4f * ch) return null;
        List<Float> as = new ArrayList<>();
        for (Label l : ls) as.add(l.box.cy() - b * l.idx);
        return new float[]{median(as), b};
    }
}
