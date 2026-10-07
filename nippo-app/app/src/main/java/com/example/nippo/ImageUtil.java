package com.example.nippo;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import java.io.IOException;
import java.io.InputStream;

/** 読み取り用の画像処理。 */
public class ImageUtil {

    /** 写真を読み込む(長辺 maxSide 以下に縮小、撮影時の向きを補正)。 */
    public static Bitmap load(Context c, Uri uri, int maxSide) throws IOException {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = c.getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(in, null, o); }
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / sample > maxSide) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        Bitmap bmp;
        try (InputStream in = c.getContentResolver().openInputStream(uri)) { bmp = BitmapFactory.decodeStream(in, null, o2); }
        if (bmp == null) throw new IOException("画像を開けません");
        int deg = 0;
        try (InputStream in = c.getContentResolver().openInputStream(uri)) {
            int ori = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (ori == ExifInterface.ORIENTATION_ROTATE_90) deg = 90;
            else if (ori == ExifInterface.ORIENTATION_ROTATE_180) deg = 180;
            else if (ori == ExifInterface.ORIENTATION_ROTATE_270) deg = 270;
        } catch (Exception ignored) {}
        if (deg != 0) {
            Matrix m = new Matrix();
            m.postRotate(deg);
            Bitmap r = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (r != bmp) bmp.recycle();
            bmp = r;
        }
        return bmp;
    }

    /**
     * 2回目の読み取り用に、左欄(拘束時間・営業収入などの並ぶ欄)を切り出して拡大し、
     * 白黒・コントラスト強調した画像を作る。box が null なら日報の標準的な位置を使う。
     */
    public static Bitmap cropForSecondPass(Bitmap src, OcrPage.Box box, float charHeight) {
        int w = src.getWidth(), h = src.getHeight();
        int[] r = cropRect(w, h, box);
        int cw = r[2] - r[0], chh = r[3] - r[1];
        float scale = scaleFor(cw, chh, charHeight);
        Bitmap crop = Bitmap.createBitmap(src, r[0], r[1], cw, chh);
        int ow = Math.max(1, Math.round(cw * scale)), oh = Math.max(1, Math.round(chh * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(crop, ow, oh, true);
        if (scaled != crop) crop.recycle();
        Bitmap out = scaled.isMutable() && scaled.getConfig() == Bitmap.Config.ARGB_8888
                ? scaled : scaled.copy(Bitmap.Config.ARGB_8888, true);
        if (out != scaled) scaled.recycle();
        int[] px = new int[ow * oh];
        out.getPixels(px, 0, ow, 0, 0, ow, oh);
        grayAutoContrast(px);
        out.setPixels(px, 0, ow, 0, 0, ow, oh);
        return out;
    }

    /** 切り出す範囲 {left, top, right, bottom}(画像内に収める)。 */
    static int[] cropRect(int w, int h, OcrPage.Box box) {
        int l, t, r, b;
        if (box != null && box.w() > w * 0.1 && box.h() > h * 0.1) {
            l = box.l; t = box.t; r = box.r; b = box.b;
        } else {          // 日報の左欄の標準的な位置
            l = 0; t = Math.round(h * 0.15f); r = Math.round(w * 0.5f); b = Math.round(h * 0.6f);
        }
        l = clamp(l, 0, w - 1); r = clamp(r, l + 1, w);
        t = clamp(t, 0, h - 1); b = clamp(b, t + 1, h);
        return new int[]{l, t, r, b};
    }

    /** 文字の高さが約40pxになるよう拡大(1〜3倍、長辺3500px以内)。 */
    static float scaleFor(int cw, int ch, float charHeight) {
        float s = charHeight > 0 ? 40f / charHeight : 1400f / Math.max(cw, 1);
        s = Math.max(1f, Math.min(3f, s));
        float cap = 3500f / Math.max(cw, ch);
        return Math.max(Math.min(s, cap), Math.min(1f, cap));
    }

    /** 白黒にして、明るさの下位2%〜上位2%を 0〜255 に引き伸ばす。 */
    static void grayAutoContrast(int[] px) {
        int[] hist = new int[256];
        for (int i = 0; i < px.length; i++) {
            int c = px[i];
            int y = (((c >> 16) & 0xFF) * 299 + ((c >> 8) & 0xFF) * 587 + (c & 0xFF) * 114) / 1000;
            px[i] = y;
            hist[y]++;
        }
        int cut = px.length / 50, lo = 0, hi = 255, acc = 0;
        for (int v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo = v; break; } }
        acc = 0;
        for (int v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cut) { hi = v; break; } }
        if (hi <= lo) { lo = 0; hi = 255; }
        for (int i = 0; i < px.length; i++) {
            int y = clamp((px[i] - lo) * 255 / (hi - lo), 0, 255);
            px[i] = 0xFF000000 | (y << 16) | (y << 8) | y;
        }
    }

    private static int clamp(int v, int lo, int hi) { return Math.max(lo, Math.min(hi, v)); }
}
