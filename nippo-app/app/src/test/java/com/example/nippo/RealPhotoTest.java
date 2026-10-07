package com.example.nippo;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;
import org.junit.Test;

/**
 * 実際の日報写真2枚(9/29: 低解像度、10/1: 高解像度)を Tesseract で読んだ結果を使い、
 * 拘束時間・営業収入が正しく決まることを確かめる。
 * 9/29 の写真全体の読み取りでは営業収入のラベルが「栄和」、値が「7ueso」と壊れているが、
 * 合計−税金額 などの検算で正しい値に復元できる。
 */
public class RealPhotoTest {
    static final String[][] DOCS = {{"doc0929", "18:11", "70850"}, {"doc1001", "18:35", "51450"}};
    static final String[] FULL = {"full_psm3", "full_psm4", "full_psm11"};
    static final String[] CROP = {"crop_psm4", "crop_psm6"};

    private static Parser parse(String f) throws Exception { return Parser.parse(TsvOcr.load(f + ".tsv")); }

    private static Reader.Result combine(Parser... ps) { return Reader.combine(Arrays.asList(ps)); }

    @Test
    public void everySinglePassGivesVerifiedValues() throws Exception {
        for (String[] d : DOCS)
            for (String v : concat(FULL, CROP)) {
                Reader.Result r = combine(parse(d[0] + "_" + v));
                String at = d[0] + " " + v;
                assertEquals(at, d[1], r.kousoku.value);
                assertEquals(at, d[2], r.income.value);
                assertEquals(at + " " + r.kousoku.note, Reader.OK_CALC, r.kousoku.level);
                assertEquals(at + " " + r.income.note, Reader.OK_CALC, r.income.level);
            }
    }

    @Test
    public void fullPlusCropGivesAllMainFields() throws Exception {
        String[][] expect = {
                {"出庫時間", "14:08", "14:09"}, {"帰庫時間", "32:19", "32:44"}, {"ハンドル時間", "13:38", "11:53"},
                {"全休憩時間", "4:33", "6:42"}, {"拘束時間", "18:11", "18:35"}, {"運賃", "71540", "51300"},
                {"料金", "6400", "5300"}, {"営業収入", "70850", "51450"}, {"税金額", "7090", "5150"},
                {"合計", "77940", "56600"}, {"ワゴン回数", "0", "0"}, {"爾後回数", "643", "383"}};
        for (int k = 0; k < 2; k++)
            for (String full : FULL) {
                String doc = DOCS[k][0];
                Reader.Result r = combine(parse(doc + "_" + full), parse(doc + "_crop_psm4"));
                for (String[] e : expect) assertEquals(doc + " " + full + " " + e[0], e[1 + k], r.fields.get(e[0]));
                assertEquals(Integer.valueOf(k == 0 ? 9 : 10), r.month);
                assertEquals(Integer.valueOf(k == 0 ? 29 : 1), r.day);
            }
    }

    @Test
    public void cropAreaCoversLeftColumn() throws Exception {
        // 写真全体の読み取りから、2回目に切り出す範囲(拘束時間・営業収入の行を含む)が求まる
        Parser p = parse("doc1001_full_psm4");
        assertNotNull(p.leftColumn);
        OcrPage page = TsvOcr.load("doc1001_full_psm4.tsv");
        for (OcrPage.Line l : page.lines) {
            String t = Parser.norm(l.text);
            if (t.startsWith("拘束時間") || t.startsWith("営業収入")) {
                assertTrue(t, l.box.t > p.leftColumn.t && l.box.b < p.leftColumn.b);
                assertTrue(t, l.box.l >= p.leftColumn.l - 5);
            }
        }
        assertTrue(p.leftColumn.r < page.width * 0.5);    // 右の納金明細は含めない
    }

    // ---- わざと崩したデータでの確認 ----
    private static OcrPage map(OcrPage src, Function<OcrPage.Word, List<OcrPage.Word>> f) {
        OcrPage p = new OcrPage();
        p.width = src.width; p.height = src.height; p.text = src.text;
        for (OcrPage.Line l : src.lines) {
            List<OcrPage.Word> ws = new ArrayList<>();
            for (OcrPage.Word w : l.words) ws.addAll(f.apply(w));
            if (ws.isEmpty()) continue;
            OcrPage.Box box = null;
            StringBuilder sb = new StringBuilder();
            for (OcrPage.Word w : ws) { box = w.box.union(box); sb.append(sb.length() > 0 ? " " : "").append(w.text); }
            p.lines.add(new OcrPage.Line(sb.toString(), box, ws));
        }
        return p;
    }

    private static OcrPage rotate(OcrPage src, double deg) {
        double a = Math.toRadians(deg), cx = src.width / 2.0, cy = src.height / 2.0;
        return map(src, w -> {
            double x = w.box.cx() - cx, y = w.box.cy() - cy;
            double nx = cx + x * Math.cos(a) - y * Math.sin(a), ny = cy + x * Math.sin(a) + y * Math.cos(a);
            int hw = w.box.w() / 2, hh = w.box.h() / 2;
            return Collections.singletonList(new OcrPage.Word(w.text,
                    new OcrPage.Box((int) nx - hw, (int) ny - hh, (int) nx + hw, (int) ny + hh)));
        });
    }

    /** 指定した文字列を含む単語を置き換える(null なら削除)。 */
    private static OcrPage replace(OcrPage src, String from, String to) {
        return map(src, w -> w.text.contains(from)
                ? (to == null ? Collections.emptyList() : Collections.singletonList(new OcrPage.Word(w.text.replace(from, to), w.box)))
                : Collections.singletonList(w));
    }

    @Test
    public void tiltedPhoto() throws Exception {
        String[][] cases = {{"doc1001_crop_psm4", "18:35", "51450", "56600"}, {"doc1001_full_psm11", "18:35", "51450", "56600"},
                {"doc0929_crop_psm4", "18:11", "70850", "77940"}, {"doc0929_full_psm4", "18:11", "70850", "77940"}};
        for (String[] c : cases)
            for (double deg : new double[]{-6, -4, -2, 2, 4, 6}) {
                String at = c[0] + " tilt " + deg;
                Reader.Result r = combine(Parser.parse(rotate(TsvOcr.load(c[0] + ".tsv"), deg)));
                assertEquals(at, c[1], r.kousoku.value);
                assertEquals(at, c[2], r.income.value);
                assertEquals(at, Reader.OK_CALC, r.kousoku.level);
                assertEquals(at, Reader.OK_CALC, r.income.level);
                assertEquals(at, c[3], r.fields.get("合計"));
            }
    }

    @Test
    public void garbledLabelsStillUseRowPosition() throws Exception {
        OcrPage p = TsvOcr.load("doc1001_crop_psm4.tsv");
        p = replace(p, "拘", "掏");      // 拘束時間 → 掏束時間
        p = replace(p, "束", "東");      // → 掏東時間(2文字違い: ラベルとしては認識されない)
        p = replace(p, "営業収", "栄和");  // 営業収入 → 栄和入
        Parser ps = Parser.parse(p);
        assertEquals("18:35", ps.fields.get("拘束時間"));     // 行の並びから位置を推定して値を取得
        assertEquals("51450", ps.fields.get("営業収入"));
    }

    @Test
    public void misreadValueIsOutvotedByCalculation() throws Exception {
        OcrPage p = replace(TsvOcr.load("doc1001_crop_psm4.tsv"), "18.35", "18.36");
        p = replace(p, "18:35", "18:36");
        p = replace(p, "51.450", "51.460");
        p = replace(p, "51,450", "51.460");
        Reader.Result r = combine(Parser.parse(p));
        assertEquals("18:35", r.kousoku.value);      // 帰庫−出庫・ハンドル+休憩 が一致
        assertEquals(Reader.OK_CALC, r.kousoku.level);
        assertEquals("51450", r.income.value);       // 合計−税金額 が優先
        assertEquals(Reader.OK_CALC, r.income.level);
    }

    @Test
    public void unverifiableValueIsMarkedForReview() throws Exception {
        OcrPage p = TsvOcr.load("doc1001_crop_psm4.tsv");
        for (String s : new String[]{"14:09", "32:44", "32.44", "11:53", "6.42", "6:42", "5.150", "5,150", "56.600", "56,600"}) p = replace(p, s, null);
        Reader.Result one = combine(Parser.parse(p));
        assertEquals("18:35", one.kousoku.value);
        assertEquals(Reader.WARN, one.kousoku.level);
        assertTrue(one.kousoku.note.startsWith("⚠"));
        assertEquals("51450", one.income.value);
        Reader.Result two = combine(Parser.parse(p), Parser.parse(p));
        assertEquals(Reader.OK_READ, two.kousoku.level);     // 2回の読み取りが一致
    }

    @Test
    public void splitValueAndCharMisreads() throws Exception {
        OcrPage p = map(TsvOcr.load("doc1001_crop_psm4.tsv"), w -> {
            if (w.text.equals("51.450")) {        // 「51,」「450」に分かれた
                OcrPage.Box b = w.box;
                int mid = b.l + b.w() * 2 / 5;
                return Arrays.asList(new OcrPage.Word("51,", new OcrPage.Box(b.l, b.t, mid, b.b)),
                        new OcrPage.Word("4S0", new OcrPage.Box(mid + 2, b.t, b.r, b.b)));   // S は 5 の誤読
            }
            if (w.text.equals("18.35")) return Collections.singletonList(new OcrPage.Word("l8:3S", w.box));
            return Collections.singletonList(w);
        });
        Parser ps = Parser.parse(p);
        assertEquals("51450", ps.fields.get("営業収入"));
        assertEquals("18:35", ps.fields.get("拘束時間"));
    }

    @Test
    public void rightTableDecoyIsIgnored() throws Exception {
        // 右の納金明細の「納金額」が「本金額」(税金額と1文字違い)と誤読されても税金額にしない
        Parser ps = parse("doc0929_full_psm3");
        Reader.Result r = combine(ps, parse("doc0929_crop_psm4"));
        assertEquals("7090", r.fields.get("税金額"));
        assertEquals("70850", r.income.value);
    }

    @Test
    public void malformedAmountIsRejected() {
        assertNull(Parser.parseNum("77.40円"));      // 「77,940」の1桁読み落とし
        assertEquals("77940", Parser.parseNum("77.940円"));
        assertEquals("1300", Parser.parseNum("1300円"));
        assertEquals("0", Parser.parseNum("0回"));
        assertEquals("4:33", Parser.parseTime("433"));
        assertEquals("32:19", Parser.parseTime("3219"));
        assertEquals("18:35", Parser.parseTime("18.35"));
        assertNull(Parser.parseTime("18:75"));
    }

    private static String[] concat(String[] a, String[] b) {
        String[] r = Arrays.copyOf(a, a.length + b.length);
        System.arraycopy(b, 0, r, a.length, b.length);
        return r;
    }
}
