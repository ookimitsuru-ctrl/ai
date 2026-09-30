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

public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 1;
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
        shoot.setText("📷 日報を撮影して保存");
        shoot.setOnClickListener(v -> startCamera());
        root.addView(shoot);

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
                txt += "\n" + Store.fmtTime(e.minutes) + "\n" + Store.fmtYen(e.yen);
                totalMin += e.minutes;
                totalYen += e.yen;
            }
            TextView c = tv(txt, 10, Color.BLACK, Gravity.CENTER);
            c.setBackgroundColor(e != null ? 0xFFE3F2FD : 0xFFF5F5F5);
            c.setMinHeight(dp(64));
            c.setPadding(0, dp(2), 0, dp(2));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            lp.setMargins(1, 1, 1, 1);
            final LocalDate dd = d;
            c.setOnClickListener(v -> editDialog(dd, store.get(dd)));
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

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_CAMERA) return;
        if (res != RESULT_OK || photoFile == null || !photoFile.exists()) { deletePhoto(); return; }
        Toast.makeText(this, "読み取り中…", Toast.LENGTH_SHORT).show();
        try {
            InputImage img = InputImage.fromFilePath(this, Uri.fromFile(photoFile));
            recognizer.process(img)
                .addOnSuccessListener(t -> { Parser p = Parser.parse(t); deletePhoto(); confirm(p); })
                .addOnFailureListener(e -> {
                    deletePhoto();
                    Toast.makeText(this, "読み取り失敗: " + e.getMessage(), Toast.LENGTH_LONG).show();
                    confirm(new Parser());
                });
        } catch (Exception e) {
            deletePhoto();
            Toast.makeText(this, "画像を開けません", Toast.LENGTH_LONG).show();
        }
    }

    /** 処理が終わった写真は削除する。 */
    private void deletePhoto() {
        if (photoFile != null) { photoFile.delete(); photoFile = null; }
    }

    // ---- 確認・編集 ----
    private void confirm(Parser p) {
        LocalDate d = null;
        try { if (p.year != null) d = LocalDate.of(p.year, p.month, p.day); } catch (Exception ignored) {}
        Store.Entry e = (p.minutes != null && p.yen != null) ? new Store.Entry(p.minutes, p.yen)
                : new Store.Entry(p.minutes != null ? p.minutes : 0, p.yen != null ? p.yen : 0);
        editDialog(d != null ? d : LocalDate.now(), e);
    }

    private void editDialog(LocalDate d, Store.Entry e) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(20), dp(8), dp(20), 0);
        EditText date = field("日付 (yyyy-MM-dd)", d.toString(), InputType.TYPE_CLASS_DATETIME);
        EditText time = field("拘束時間 (例 18:11)", e == null ? "" : Store.fmtTime(e.minutes), InputType.TYPE_CLASS_DATETIME);
        EditText yen = field("営業収入 (円)", e == null ? "" : String.valueOf(e.yen), InputType.TYPE_CLASS_NUMBER);
        l.addView(date); l.addView(time); l.addView(yen);
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("運転者営業日報")
                .setView(l)
                .setPositiveButton("保存", (dlg, w) -> {
                    try {
                        LocalDate nd = LocalDate.parse(date.getText().toString().trim());
                        String[] tp = time.getText().toString().trim().split("[:：]");
                        int min = Integer.parseInt(tp[0]) * 60 + Integer.parseInt(tp[1]);
                        int y = Integer.parseInt(yen.getText().toString().trim().replace(",", ""));
                        store.put(nd, new Store.Entry(min, y));
                        LocalDate s = nd.getDayOfMonth() >= 16 ? nd.withDayOfMonth(16) : nd.minusMonths(1).withDayOfMonth(16);
                        periodStart = s;
                        render();
                    } catch (Exception ex) {
                        Toast.makeText(this, "入力形式が正しくありません", Toast.LENGTH_LONG).show();
                    }
                })
                .setNegativeButton("キャンセル", null);
        if (store.get(d) != null)
            b.setNeutralButton("削除", (dlg, w) -> { store.remove(d); render(); });
        b.show();
    }

    private EditText field(String hint, String val, int type) {
        EditText t = new EditText(this);
        t.setHint(hint);
        t.setText(val);
        t.setInputType(type);
        return t;
    }
}
