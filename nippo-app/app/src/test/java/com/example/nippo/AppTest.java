package com.example.nippo;

import static org.junit.Assert.*;

import android.app.AlertDialog;
import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.shadows.ShadowPopupMenu;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class AppTest {

    private static void texts(View v, List<String> out) {
        if (v instanceof TextView) out.add(((TextView) v).getText().toString());
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) texts(((ViewGroup) v).getChildAt(i), out);
    }
    private static List<String> allTexts(View v) { List<String> l = new ArrayList<>(); texts(v, l); return l; }
    private static void find(View v, String text, List<View> out) {
        if (v instanceof TextView && ((TextView) v).getText().toString().contains(text)) out.add(v);
        if (v instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) v).getChildCount(); i++) find(((ViewGroup) v).getChildAt(i), text, out);
    }

    private static Store.Entry entry(String time, String yen) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(Fields.MINUTES, time); m.put(Fields.INCOME, yen); m.put("全走行距離", "274"); m.put("営業回数", "17");
        m.put(Fields.OCR, "運転者営業日報 全文テスト");
        return new Store.Entry(m);
    }

    @Test
    public void serialRestartsPerPageAndOnlyOnDataDays() {
        Context c = RuntimeEnvironment.getApplication();
        Store s = new Store(c);
        s.put(LocalDate.of(2026, 9, 17), entry("18:11", "70850"));
        s.put(LocalDate.of(2026, 9, 20), entry("10:00", "50000"));
        s.put(LocalDate.of(2026, 10, 17), entry("12:30", "60000"));   // 次のページ(10/16〜11/15)
        assertEquals(1, s.serial(LocalDate.of(2026, 9, 17)));
        assertEquals(2, s.serial(LocalDate.of(2026, 9, 20)));
        assertEquals(0, s.serial(LocalDate.of(2026, 9, 18)));         // データのない日
        assertEquals(1, s.serial(LocalDate.of(2026, 10, 17)));        // ページが変わると 1 から
    }

    @Test
    public void calendarShowsOnlyKousokuAndShuunyuu_andDetailShowsAll_andStatsWork() {
        Context c = RuntimeEnvironment.getApplication();
        Store s = new Store(c);
        LocalDate t = LocalDate.now();
        LocalDate ps = t.getDayOfMonth() >= 16 ? t.withDayOfMonth(16) : t.minusMonths(1).withDayOfMonth(16);
        s.put(ps.plusDays(1), entry("18:11", "70850"));
        s.put(ps.plusDays(3), entry("10:00", "50000"));
        s.put(ps.minusMonths(1).plusDays(2), entry("12:30", "60000"));

        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        View root = a.findViewById(android.R.id.content);
        List<String> tx = allTexts(root);
        System.out.println("CALENDAR TEXTS: " + tx);
        assertTrue(tx.contains("📷 日報を撮影して取り込み"));
        assertTrue(tx.contains("🖼 写真から取り込み"));
        assertTrue(tx.contains("☰ メニュー"));
        assertTrue(tx.stream().anyMatch(x -> x.contains("18:11") && x.contains("70,850")));
        assertTrue(tx.stream().anyMatch(x -> x.contains("拘束時間:28:11")));        // 合計 18:11+10:00
        assertTrue(tx.stream().anyMatch(x -> x.contains("営業収入:120,850 円")));
        assertFalse(tx.stream().anyMatch(x -> x.contains("274")));                  // 他の項目はカレンダーに出さない
        assertTrue(tx.contains("1") && tx.contains("2"));                           // 連番(透かし)

        // 日付(データのある日)をタップ → 全項目の詳細
        List<View> cells = new ArrayList<>();
        find(root, "18:11", cells);
        ((View) cells.get(0).getParent()).performClick();
        AlertDialog d = ShadowAlertDialog.getLatestAlertDialog();
        assertNotNull(d);
        List<String> dt = allTexts(d.getWindow().getDecorView());
        System.out.println("DETAIL TEXTS: " + dt);
        assertTrue(dt.stream().anyMatch(x -> x.contains("全走行距離:  274 Km")));
        assertTrue(dt.stream().anyMatch(x -> x.contains("営業回数:  17 回")));
        assertTrue(dt.stream().anyMatch(x -> x.contains("全文テスト")));
        d.dismiss();

        // メニュー → 月別集計
        List<View> menu = new ArrayList<>();
        find(root, "☰ メニュー", menu);
        menu.get(0).performClick();
        PopupMenu pm = ShadowPopupMenu.getLatestPopupMenu();
        assertNotNull(pm);
        assertEquals("月別集計・グラフ", pm.getMenu().getItem(0).getTitle().toString());
        // メニュー項目の実行(リスナー呼び出し)
        Shadows.shadowOf(pm).getOnMenuItemClickListener().onMenuItemClick(pm.getMenu().getItem(0));
        List<String> st = allTexts(a.findViewById(android.R.id.content));
        System.out.println("STATS TEXTS: " + st);
        assertTrue(st.stream().anyMatch(x -> x.contains("営業収入  合計 120,850 円  /  平均 60,425 円")));
        assertTrue(st.stream().anyMatch(x -> x.contains("拘束時間  合計 28:11  /  平均 14:06")));
        assertTrue(st.stream().anyMatch(x -> x.contains("営業収入  合計 60,000 円  /  平均 60,000 円")));
        assertTrue(st.stream().anyMatch(x -> x.contains("拘束時間  合計 12:30  /  平均 12:30")));
        assertTrue(st.contains("営業収入 合計(円)") && st.contains("拘束時間 平均(1日)"));
    }
}
