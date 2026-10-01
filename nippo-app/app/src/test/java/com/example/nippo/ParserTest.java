package com.example.nippo;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import android.graphics.Rect;
import com.google.mlkit.vision.text.Text;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** 日報の配置(ラベルが左、値が同じ高さの右)を模したOCR結果で、読み取りロジックを検証する。 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ParserTest {
    private final List<Text.Line> lines = new ArrayList<>();
    private int y = 100;

    private Text.Element el(String s, int l, int w) {
        Text.Element e = mock(Text.Element.class);
        when(e.getText()).thenReturn(s);
        when(e.getBoundingBox()).thenReturn(new Rect(l, y, l + w, y + 30));
        return e;
    }
    private void line(String s, int l, int w) {          // 1行1要素
        Text.Element elem = el(s, l, w);
        Text.Line ln = mock(Text.Line.class);
        when(ln.getText()).thenReturn(s);
        when(ln.getBoundingBox()).thenReturn(new Rect(l, y, l + w, y + 30));
        when(ln.getElements()).thenReturn((List) Arrays.asList(elem));
        lines.add(ln);
    }
    /** ラベルと値を別々の行(別ブロック)として出す。 */
    private void row(String label, String value) {
        line(label, 60, 200);
        line(value, 400, 100);
        y += 40;
    }
    private Text text(String full) {
        Text.TextBlock b = mock(Text.TextBlock.class);
        when(b.getLines()).thenReturn((List) lines);
        List blocks = Arrays.asList(b);
        Text t = mock(Text.class);
        when(t.getText()).thenReturn(full);
        when(t.getTextBlocks()).thenReturn(blocks);
        return t;
    }

    @Test
    public void parsesDocumentLikeLayout() {
        row("出庫時間", "14:08");
        row("帰庫時間", "32:19");
        row("ハンドル時間", "13:38");
        row("全休憩時間", "4:33");
        row("拘束時間", "18:11");
        row("全走行距離", "274 Km");
        row("実車走行距離", "123 Km");
        row("営業回数", "17 回");
        row("爾後回数", "643 回");            // 「顧後回数」の誤読パターン
        row("運賃", "71,540 円");
        row("営業収入", "70,850 円");
        row("税金額", "7,090 円");
        row("合計", "77,940 円");
        row("合計金額", "630円");              // ETCの合計は拾わない
        row("最高速度", "95 Km/h");
        Parser p = Parser.parse(text("運転者営業日報(点呼用) 2026年9月29日(火)"));
        assertEquals(Integer.valueOf(2026), p.year);
        assertEquals(Integer.valueOf(9), p.month);
        assertEquals(Integer.valueOf(29), p.day);
        assertEquals("18:11", p.fields.get("拘束時間"));
        assertEquals("70850", p.fields.get("営業収入"));
        assertEquals("4:33", p.fields.get("全休憩時間"));
        assertEquals("274", p.fields.get("全走行距離"));
        assertEquals("643", p.fields.get("顧後回数"));
        assertEquals("77940", p.fields.get("合計"));
        assertEquals("71540", p.fields.get("運賃"));
        assertEquals("95", p.fields.get("最高速度"));
        System.out.println("PARSED: " + p.fields);
    }

    @Test
    public void parsesSameLineValue() {
        line("拘束時間 18:11", 60, 300); y += 40;
        line("営業収入 70,850 円", 60, 300);
        Parser p = Parser.parse(text("2026年9月29日"));
        assertEquals("18:11", p.fields.get("拘束時間"));
        assertEquals("70850", p.fields.get("営業収入"));
    }
}
