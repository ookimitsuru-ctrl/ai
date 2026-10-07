package com.example.nippo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.PopupMenu;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions;
import java.io.File;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 1, REQ_PICK = 2;
    private static final String[] WEEK = {"日", "月", "火", "水", "木", "金", "土"};

    private Store store;
    private LocalDate periodStart;          // 各ページの開始日(16日)
    private File photoFile;
    private LinearLayout root;
    private TextRecognizer recognizer;
    private boolean inStats = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new Store(this);
        LocalDate t = LocalDate.now();
        periodStart = Period.containing(t).start;
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

    @Override
    public void onBackPressed() {
        if (inStats) { render(); return; }
        super.onBackPressed();
    }

    private void render() {
        inStats = false;
        root.removeAllViews();
        Period curP = Period.containing(periodStart);
        LocalDate end = curP.end;

        Button menu = new Button(this);
        menu.setText("☰ メニュー");
        menu.setOnClickListener(v -> {
            PopupMenu pm = new PopupMenu(this, v);
            pm.getMenu().add(0, 1, 0, "月別集計・グラフ");
            pm.setOnMenuItemClickListener(it -> { if (it.getItemId() == 1) showStats(); return true; });
            pm.show();
        });
        root.addView(menu);

        Button shoot = new Button(this);
        shoot.setText("📷 日報を撮影して取り込み");
        shoot.setOnClickListener(v -> startCamera());
        root.addView(shoot);
        Button pick = new Button(this);
        pick.setText("🖼 写真から取り込み");
        pick.setOnClickListener(v -> startPick());
        root.addView(pick);
        root.addView(tv("撮影のコツ: 明るい所で、日報全体が入るように真上から。影や反射が文字にかからないように。", 12, Color.GRAY, Gravity.START));

        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        Button prev = new Button(this); prev.setText("◀");
        prev.setOnClickListener(v -> { periodStart = curP.prev().start; render(); });
        Button next = new Button(this); next.setText("▶");
        next.setOnClickListener(v -> { periodStart = curP.next().start; render(); });
        TextView title = tv(curP.label() + "\n(" + curP.range() + ")",
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

    // ---- 月別集計 ----
    private void showStats() {
        inStats = true;
        root.removeAllViews();
        Button back = new Button(this);
        back.setText("◀ カレンダーに戻る");
        back.setOnClickListener(v -> render());
        root.addView(back);
        root.addView(tv("月別集計(○月度)", 18, Color.BLACK, Gravity.START));

        java.util.TreeMap<LocalDate, int[]> agg = new java.util.TreeMap<>();   // 期間開始日 -> {日数, 分合計, 円合計}
        for (Map.Entry<LocalDate, Store.Entry> en : store.all().entrySet()) {
            LocalDate d = en.getKey();
            LocalDate ps = Period.containing(d).start;
            int[] a = agg.computeIfAbsent(ps, k -> new int[3]);
            a[0]++; a[1] += en.getValue().minutes(); a[2] += en.getValue().yen();
        }
        if (agg.isEmpty()) {
            root.addView(tv("\nまだデータがありません。", 16, Color.DKGRAY, Gravity.START));
            return;
        }
        // 新しい期間から最大12件
        java.util.List<LocalDate> keys = new java.util.ArrayList<>(agg.keySet());
        int from = Math.max(0, keys.size() - 12);
        keys = keys.subList(from, keys.size());
        int n = keys.size();
        double[] sumYen = new double[n], avgYen = new double[n], sumMin = new double[n], avgMin = new double[n];
        String[] lab = new String[n], tSumYen = new String[n], tAvgYen = new String[n], tSumMin = new String[n], tAvgMin = new String[n];

        for (int i = 0; i < n; i++) {
            LocalDate ps = keys.get(i);
            Period pr = Period.containing(ps);
            int[] a = agg.get(ps);
            sumYen[i] = a[2]; avgYen[i] = a[2] / (double) a[0];
            sumMin[i] = a[1]; avgMin[i] = a[1] / (double) a[0];
            lab[i] = pr.month + "月度";
            tSumYen[i] = Store.fmtYen(a[2]); tAvgYen[i] = Store.fmtYen((int) Math.round(avgYen[i]));
            tSumMin[i] = Store.fmtTime(a[1]); tAvgMin[i] = Store.fmtTime((int) Math.round(avgMin[i]));
        }
        // 一覧(新しい期間が上)
        for (int i = n - 1; i >= 0; i--) {
            LocalDate ps = keys.get(i);
            Period pr = Period.containing(ps);
            int[] a = agg.get(ps);
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(12), dp(8), dp(12), dp(8));
            card.setBackgroundColor(0xFFF3F0FF);
            card.addView(tv(pr.label() + "  (" + pr.range() + ")  " + a[0] + "日", 15, Color.BLACK, Gravity.START));
            card.addView(tv("営業収入  合計 " + tSumYen[i] + " 円  /  平均 " + tAvgYen[i] + " 円", 14, Color.DKGRAY, Gravity.START));
            card.addView(tv("拘束時間  合計 " + tSumMin[i] + "  /  平均 " + tAvgMin[i], 14, Color.DKGRAY, Gravity.START));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.topMargin = dp(8);
            root.addView(card, lp);
        }
        addChart("営業収入 合計(円)", sumYen, tSumYen, lab, 0xFF7C5AF0);
        addChart("営業収入 平均(円/日)", avgYen, tAvgYen, lab, 0xFFE0559B);
        addChart("拘束時間 合計", sumMin, tSumMin, lab, 0xFF2E9E8F);
        addChart("拘束時間 平均(1日)", avgMin, tAvgMin, lab, 0xFFF29D38);
    }

    private void addChart(String title, double[] v, String[] vt, String[] lab, int color) {
        TextView t = tv(title, 15, Color.BLACK, Gravity.START);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2);
        tp.topMargin = dp(20);
        root.addView(t, tp);
        root.addView(new BarChart(this, v, vt, lab, color), new LinearLayout.LayoutParams(-1, dp(170)));
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

    /**
     * 画像を読み取る。撮影した写真(deleteAfter=true)は処理後に削除、選んだ写真は残す。
     * 1回目は写真全体、2回目は左欄を切り出して拡大・白黒強調した画像を読み、検算して値を決める。
     */
    private void recognize(Uri uri, boolean deleteAfter) {
        AlertDialog progress = new AlertDialog.Builder(this)
                .setMessage("読み取り中…(2回読み取って検算しています)")
                .setCancelable(false)
                .show();
        if (recognizer == null) recognizer = TextRecognition.getClient(new JapaneseTextRecognizerOptions.Builder().build());
        final TextRecognizer rec = recognizer;
        new Thread(() -> {
            Reader.Result res = null;
            String err = null;
            try {
                Bitmap full = ImageUtil.load(this, uri, 4096);
                List<Parser> passes = new ArrayList<>();
                Text t1 = Tasks.await(rec.process(InputImage.fromBitmap(full, 0)));
                Parser p1 = Parser.parse(MlKitOcr.toPage(t1, full.getWidth(), full.getHeight()));
                passes.add(p1);
                try {
                    Bitmap crop = ImageUtil.cropForSecondPass(full, p1.leftColumn, p1.charHeight);
                    Text t2 = Tasks.await(rec.process(InputImage.fromBitmap(crop, 0)));
                    passes.add(Parser.parse(MlKitOcr.toPage(t2, crop.getWidth(), crop.getHeight())));
                    crop.recycle();
                } catch (Exception ignored) {
                    // 2回目に失敗しても1回目の結果で続ける
                }
                full.recycle();
                res = Reader.combine(passes);
            } catch (Throwable e) {
                err = e.getMessage();
            }
            final Reader.Result fr = res;
            final String fe = err;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                progress.dismiss();
                if (deleteAfter) deletePhoto();
                if (fr == null) {
                    Toast.makeText(this, "読み取り失敗: " + fe, Toast.LENGTH_LONG).show();
                    confirm(Reader.empty());
                } else confirm(fr);
            });
        }).start();
    }

    /** 処理が終わった写真は削除する。 */
    private void deletePhoto() {
        if (photoFile != null) { photoFile.delete(); photoFile = null; }
    }

    // ---- 確認・編集 ----
    /** 取り込み確認。全データを保存し、ここでは日付・拘束時間・営業収入だけを表示する。 */
    private void confirm(Reader.Result p) {
        LocalDate d = null;
        try { if (p.year != null) d = LocalDate.of(p.year, p.month, p.day); } catch (Exception ignored) {}
        final LocalDate date0 = d != null ? d : LocalDate.now();
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(20), dp(8), dp(20), 0);
        EditText date = field("日付 (yyyy-MM-dd)", date0.toString(), InputType.TYPE_CLASS_DATETIME);
        EditText time = field("拘束時間 (例 18:11)", p.fields.getOrDefault(Fields.MINUTES, ""), InputType.TYPE_CLASS_DATETIME);
        EditText yen = field("営業収入 (円)", p.fields.getOrDefault(Fields.INCOME, ""), InputType.TYPE_CLASS_NUMBER);
        l.addView(date);
        l.addView(time);
        l.addView(status(p.kousoku));
        l.addView(yen);
        l.addView(status(p.income));
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
                        periodStart = Period.containing(nd).start;
                        render();
                    } catch (Exception ex) {
                        Toast.makeText(this, "入力形式が正しくありません", Toast.LENGTH_LONG).show();
                    }
                })
                .setNegativeButton("キャンセル", null)
                .show();
    }

    /** 検算結果の表示(緑=検算一致、橙=要確認)。 */
    private TextView status(Reader.Check c) {
        int color = c.level == Reader.OK_CALC ? 0xFF2E7D32 : c.level == Reader.OK_READ ? 0xFF1565C0 : 0xFFE65100;
        TextView t = tv(c.note, 13, color, Gravity.START);
        t.setPadding(dp(4), 0, 0, dp(10));
        return t;
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
                        periodStart = Period.containing(nd).start;
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
