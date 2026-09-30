package com.example.nippo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions;
import java.io.File;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 1, REQ_PICK = 2;
    private static final String[] WEEK = {"日", "月", "火", "水", "木", "金", "土"};

    private Store store;
    private LocalDate periodStart;          // 各ページの開始日(16日)
    private File photoFile;
    private LinearLayout root;
    private TextRecognizer recognizer;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new Store(this);
        recognizer = TextRecognition.getClient(new JapaneseTextRecognizerOptions.Builder().build());
        LocalDate t = LocalDate.now();
        periodStart = t.getDayOfMonth() >= 16 ? t.withDayOfMonth(16) : t.minusMonths(1).withDayOfMonth(16);
        ScrollView sv = new ScrollView(this);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(8), dp(8), dp(8), dp(8));
        sv.addView(root);
        setContentView(sv);
        render();
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    private TextView tv(String s, int sp, int color, int gravity) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(gravity);
        return t;
    }

    private void render() {
        root.removeAllViews();
        LocalDate end = periodStart.plusMonths(1).withDayOfMonth(15);

        Button shoot = new Button(this);
        shoot.setText("📷 日報を撮影して取り込み");
        shoot.setOnClickListener(v -> startCamera());
        root.addView(shoot);
        Button pick = new Button(this);
        pick.setText("🖼 写真から取り込み");
        pick.setOnClickListener(v -> startPick());
        root.addView(pick);

        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        Button prev = new Button(this); prev.setText("◀");
        prev.setOnClickListener(v -> { periodStart = periodStart.minusMonths(1); render(); });
        Button next = new Button(this); next.setText("▶");
        next.setOnClickListener(v -> { periodStart = periodStart.plusMonths(1); render(); });
        TextView title = tv(periodStart.getMonthValue() + "/16 〜 " + end.getMonthValue() + "/15  (" + end.getYear() + ")",
                16, Color.BLACK, Gravity.CENTER);
        nav.addView(prev);
        nav.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        nav.addView(next);
        root.addView(nav);

        LinearLayout head = new LinearLayout(this);
        for (String w : WEEK) head.addView(tv(w, 12, Color.DKGRAY, Gravity.CENTER), new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(head);

        int totalMin = 0, totalYen = 0;
        LinearLayout row = null;
        int lead = periodStart.getDayOfWeek().getValue() % 7;   // 日曜=0
        for (LocalDate d = periodStart; !d.isAfter(end); d = d.plusDays(1)) {
            int col = d.getDayOfWeek().getValue() % 7;
            if (row == null || col == 0) {
                row = new LinearLayout(this);
                root.addView(row);
                if (d.equals(periodStart)) for (int i = 0; i < lead; i++) row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
            }
            Store.Entry e = store.get(d);
            String txt = d.getDayOfMonth() + "";
            if (e != null) {
                txt += "\n" + Store.fmtTime(e.minutes()) + "\n" + Store.fmtYen(e.yen());
                totalMin += e.minutes();
                totalYen += e.yen();
            }
            FrameLayout c = new FrameLayout(this);
            c.setBackgroundColor(e != null ? 0xFFE3F2FD : 0xFFF5F5F5);
            c.setMinimumHeight(dp(64));
            int serial = store.serial(d);
            if (serial > 0) {                       // 最初の記入日からの連番を枠いっぱいに透かし表示
                TextView wm = tv(String.valueOf(serial), 30, 0x33000000, Gravity.CENTER);
                wm.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                wm.setIncludeFontPadding(false);
                c.addView(wm, new FrameLayout.LayoutParams(-1, -1));
            }
            TextView label = tv(txt, 10, Color.BLACK, Gravity.CENTER);
            label.setPadding(0, dp(2), 0, dp(2));
            c.addView(label, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(64), 1);
            lp.setMargins(1, 1, 1, 1);
            final LocalDate dd = d;
            c.setOnClickListener(v -> {
                Store.Entry cur = store.get(dd);
                if (cur != null) detailDialog(dd, cur); else editDialog(dd, new Store.Entry(new LinkedHashMap<>()));
            });
            row.addView(c, lp);
        }
        if (row != null) {
            int n = row.getChildCount();
            for (int i = n; i < 7; i++) row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        }

        LinearLayout sum = new LinearLayout(this);
        sum.setOrientation(LinearLayout.VERTICAL);
        sum.setPadding(dp(12), dp(12), dp(12), dp(12));
        sum.setBackgroundColor(0xFFFFF8E1);
        sum.addView(tv("合計(この期間)", 14, Color.DKGRAY, Gravity.START));
        sum.addView(tv("拘束時間:" + Store.fmtTime(totalMin), 20, Color.BLACK, Gravity.START));
        sum.addView(tv("営業収入:" + Store.fmtYen(totalYen) + " 円", 20, Color.BLACK, Gravity.START));
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2);
        sp.topMargin = dp(12);
        root.addView(sum, sp);
    }

    // ---- 撮影 ----
    private void startCamera() {
        try {
            File dir = new File(getExternalFilesDir(null), "tmp");
            dir.mkdirs();
            photoFile = new File(dir, "nippo_" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photoFile);
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, uri);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(i, REQ_CAMERA);
        } catch (Exception e) {
            Toast.makeText(this, "カメラを起動できません: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    // ---- 保存済みの写真から取り込み(写真は削除しない) ----
    private void startPick() {
        try {
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.setType("image/*");
            i.addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(Intent.createChooser(i, "日報の写真を選択"), REQ_PICK);
        } catch (Exception e) {
            Toast.makeText(this, "写真を選べません: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_PICK) {
            if (res != RESULT_OK || data == null || data.getData() == null) return;
            recognize(data.getData(), false);
            return;
        }
        if (req != REQ_CAMERA) return;
        if (res != RESULT_OK || photoFile == null || !photoFile.exists()) { deletePhoto(); return; }
        recognize(Uri.fromFile(photoFile), true);
    }

    /** 画像を読み取る。撮影した写真(deleteAfter=true)は処理後に削除、選んだ写真は残す。 */
    private void recognize(Uri uri, boolean deleteAfter) {
        Toast.makeText(this, "読み取り中…", Toast.LENGTH_SHORT).show();
        try {
            InputImage img = InputImage.fromFilePath(this, uri);
            recognizer.process(img)
                .addOnSuccessListener(t -> { Parser p = Parser.parse(t); if (deleteAfter) deletePhoto(); confirm(p); })
                .addOnFailureListener(e -> {
                    if (deleteAfter) deletePhoto();
                    Toast.makeText(this, "読み取り失敗: " + e.getMessage(), Toast.LENGTH_LONG).show();
                    confirm(new Parser());
                });
        } catch (Exception e) {
            if (deleteAfter) deletePhoto();
            Toast.makeText(this, "画像を開けません", Toast.LENGTH_LONG).show();
        }
    }

    /** 処理が終わった写真は削除する。 */
    private void deletePhoto() {
        if (photoFile != null) { photoFile.delete(); photoFile = null; }
    }

    // ---- 確認・編集 ----
    /** 取り込み確認。全データを保存し、ここでは日付・拘束時間・営業収入だけを表示する。 */
    private void confirm(Parser p) {
        LocalDate d = null;
        try { if (p.year != null) d = LocalDate.of(p.year, p.month, p.day); } catch (Exception ignored) {}
        final LocalDate date0 = d != null ? d : LocalDate.now();
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(20), dp(8), dp(20), 0);
        EditText date = field("日付 (yyyy-MM-dd)", date0.toString(), InputType.TYPE_CLASS_DATETIME);
        EditText time = field("拘束時間 (例 18:11)", p.fields.getOrDefault(Fields.MINUTES, ""), InputType.TYPE_CLASS_DATETIME);
        EditText yen = field("営業収入 (円)", p.fields.getOrDefault(Fields.INCOME, ""), InputType.TYPE_CLASS_NUMBER);
        l.addView(date); l.addView(time); l.addView(yen);
        new AlertDialog.Builder(this)
                .setTitle("取り込み内容の確認")
                .setView(l)
                .setPositiveButton("保存", (dlg, w) -> {
                    try {
                        LocalDate nd = LocalDate.parse(date.getText().toString().trim());
                        String tv = time.getText().toString().trim().replace("：", ":");
                        String[] tp = tv.split(":");
                        Integer.parseInt(tp[0]); Integer.parseInt(tp[1]);
                        String yv = yen.getText().toString().trim().replace(",", "");
                        Long.parseLong(yv);
                        Map<String, String> m = new LinkedHashMap<>(p.fields);   // 読み取れた全項目
                        m.put(Fields.MINUTES, tv);
                        m.put(Fields.INCOME, yv);
                        m.put(Fields.OCR, p.raw);
                        store.put(nd, new Store.Entry(m));
                        periodStart = nd.getDayOfMonth() >= 16 ? nd.withDayOfMonth(16) : nd.minusMonths(1).withDayOfMonth(16);
                        render();
                    } catch (Exception ex) {
                        Toast.makeText(this, "入力形式が正しくありません", Toast.LENGTH_LONG).show();
                    }
                })
                .setNegativeButton("キャンセル", null)
                .show();
    }

    /** 日付をタップしたとき、保存した日報の全項目を表示する。 */
    private void detailDialog(LocalDate d, Store.Entry e) {
        StringBuilder sb = new StringBuilder();
        for (Fields.F f : Fields.ALL)
            sb.append(f.label).append(":  ").append(Fields.display(f, e.f.get(f.label))).append("\n");
        String ocr = e.f.get(Fields.OCR);
        if (ocr != null && !ocr.isEmpty()) sb.append("\n--- 読み取った全文 ---\n").append(ocr).append("\n");
        TextView t = tv(sb.toString(), 16, Color.BLACK, Gravity.START);
        t.setPadding(dp(20), dp(12), dp(20), dp(12));
        t.setLineSpacing(dp(4), 1f);
        ScrollView sv = new ScrollView(this);
        sv.addView(t);
        new AlertDialog.Builder(this)
                .setTitle("運転者営業日報  " + d.getYear() + "年" + d.getMonthValue() + "月" + d.getDayOfMonth() + "日")
                .setView(sv)
                .setPositiveButton("閉じる", null)
                .setNegativeButton("編集", (dlg, w) -> editDialog(d, e))
                .setNeutralButton("削除", (dlg, w) -> { store.remove(d); render(); })
                .show();
    }

    private void editDialog(LocalDate d, Store.Entry e) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(20), dp(8), dp(20), 0);
        EditText date = field("日付 (yyyy-MM-dd)", d.toString(), InputType.TYPE_CLASS_DATETIME);
        l.addView(date);
        Map<String, EditText> edits = new LinkedHashMap<>();
        for (Fields.F f : Fields.ALL) {
            String hint = f.label + (f.type == Fields.TIME ? " (例 18:11)" : f.unit.isEmpty() ? "" : " (" + f.unit + ")");
            String v = e.f.get(f.label);
            EditText et = field(hint, v == null ? "" : v, f.type == Fields.TIME ? InputType.TYPE_CLASS_DATETIME : InputType.TYPE_CLASS_NUMBER);
            edits.put(f.label, et);
            l.addView(et);
        }
        ScrollView sv = new ScrollView(this);
        sv.addView(l);
        new AlertDialog.Builder(this)
                .setTitle("運転者営業日報")
                .setView(sv)
                .setPositiveButton("保存", (dlg, w) -> {
                    try {
                        LocalDate nd = LocalDate.parse(date.getText().toString().trim());
                        Map<String, String> m = new LinkedHashMap<>();
                        for (Fields.F f : Fields.ALL) {
                            String v = edits.get(f.label).getText().toString().trim().replace(",", "").replace("：", ":");
                            if (v.isEmpty()) continue;
                            if (f.type == Fields.TIME) {
                                String[] tp = v.split(":");
                                Integer.parseInt(tp[0]); Integer.parseInt(tp[1]);
                            } else {
                                Long.parseLong(v);
                            }
                            m.put(f.label, v);
                        }
                        if (e.f.get(Fields.OCR) != null) m.put(Fields.OCR, e.f.get(Fields.OCR));
                        store.put(nd, new Store.Entry(m));
                        periodStart = nd.getDayOfMonth() >= 16 ? nd.withDayOfMonth(16) : nd.minusMonths(1).withDayOfMonth(16);
                        render();
                    } catch (Exception ex) {
                        Toast.makeText(this, "入力形式が正しくありません", Toast.LENGTH_LONG).show();
                    }
                })
                .setNegativeButton("キャンセル", null)
                .show();
    }

    private EditText field(String hint, String val, int type) {
        EditText t = new EditText(this);
        t.setHint(hint);
        t.setText(val);
        t.setInputType(type);
        return t;
    }
}
