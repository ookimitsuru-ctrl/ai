package com.example.nippo;

/** 日報に保存する項目の一覧(表示順)。 */
public class Fields {
    public static final int TIME = 0, NUM = 1;

    public static class F {
        public final String label; public final int type; public final String unit; public final String[] aliases;
        F(String label, int type, String unit, String... aliases) {
            this.label = label; this.type = type; this.unit = unit; this.aliases = aliases;
        }
    }

    public static final String OCR = "_ocr";   // 読み取った全文(全データ)

    public static final String MINUTES = "拘束時間", INCOME = "営業収入";

    public static final F[] ALL = {
        new F("出庫時間", TIME, ""),
        new F("帰庫時間", TIME, ""),
        new F("ハンドル時間", TIME, ""),
        new F("全休憩時間", TIME, ""),
        new F("拘束時間", TIME, ""),
        new F("全走行距離", NUM, "Km"),
        new F("実車走行距離", NUM, "Km"),
        new F("空転走行距離", NUM, "Km"),
        new F("営業回数", NUM, "回"),
        new F("顧後回数", NUM, "回", "爾後回数", "顧後回数"),
        new F("迎車回数", NUM, "回"),
        new F("障割回数", NUM, "回"),
        new F("ワゴン回数", NUM, "回"),
        new F("早朝回数", NUM, "回"),
        new F("予約回数", NUM, "回"),
        new F("遠割回数", NUM, "回"),
        new F("EDS回数", NUM, "回"),
        new F("プレミアム貸切回数", NUM, "回"),
        new F("運賃", NUM, "円"),
        new F("料金", NUM, "円"),
        new F("アプリ手配料金", NUM, "円"),
        new F("障碍者割引額", NUM, "円", "障害者割引額"),
        new F("営業収入", NUM, "円"),
        new F("税金額", NUM, "円"),
        new F("合計", NUM, "円"),
        new F("親メーター指数", NUM, ""),
        new F("エンジン駆動時間", TIME, ""),
        new F("最高速度", NUM, "Km/h"),
        new F("急加速回数", NUM, "回"),
        new F("急減速回数", NUM, "回"),
        new F("最大連続走行時間", TIME, ""),
    };

    public static String display(F f, String v) {
        if (v == null || v.isEmpty()) return "-";
        if (f.type == NUM) {
            try {
                String s = String.format("%,d", Long.parseLong(v));
                return f.unit.isEmpty() ? s : s + " " + f.unit;
            } catch (NumberFormatException e) { return v; }
        }
        return v;
    }
}
