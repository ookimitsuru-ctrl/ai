package com.example.nippo;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/** 簡易の棒グラフ。 */
public class BarChart extends View {
    private final double[] values;
    private final String[] labels;
    private final String[] valueTexts;
    private final Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG), txt = new Paint(Paint.ANTI_ALIAS_FLAG), axis = new Paint();

    public BarChart(Context c, double[] values, String[] valueTexts, String[] labels, int color) {
        super(c);
        this.values = values; this.valueTexts = valueTexts; this.labels = labels;
        bar.setColor(color);
        txt.setColor(0xFF333333);
        axis.setColor(0xFFBBBBBB);
    }

    @Override
    protected void onDraw(Canvas c) {
        float d = getResources().getDisplayMetrics().density;
        int n = values.length;
        if (n == 0) return;
        float w = getWidth(), h = getHeight();
        float top = 18 * d, bottom = h - 20 * d, left = 4 * d, right = w - 4 * d;
        double max = 0;
        for (double v : values) max = Math.max(max, v);
        if (max <= 0) max = 1;
        c.drawLine(left, bottom, right, bottom, axis);
        float slot = (right - left) / n, bw = Math.min(slot * 0.6f, 40 * d);
        txt.setTextAlign(Paint.Align.CENTER);
        for (int i = 0; i < n; i++) {
            float cx = left + slot * (i + 0.5f);
            float bh = (float) (values[i] / max) * (bottom - top);
            c.drawRect(cx - bw / 2, bottom - bh, cx + bw / 2, bottom, bar);
            txt.setTextSize(Math.min(10 * d, slot / 5.2f * 1.0f + 2 * d));
            c.drawText(valueTexts[i], cx, bottom - bh - 3 * d, txt);
            txt.setTextSize(9 * d);
            c.drawText(labels[i], cx, h - 5 * d, txt);
        }
    }
}
