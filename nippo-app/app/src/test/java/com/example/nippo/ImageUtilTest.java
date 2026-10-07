package com.example.nippo;

import static org.junit.Assert.*;

import org.junit.Test;

public class ImageUtilTest {
    @Test
    public void cropRectUsesBoxOrDefaultAndClamps() {
        assertArrayEquals(new int[]{0, 300, 500, 1200}, ImageUtil.cropRect(1000, 2000, null));
        assertArrayEquals(new int[]{0, 0, 450, 1100}, ImageUtil.cropRect(1000, 2000, new OcrPage.Box(-20, -5, 450, 1100)));
        assertArrayEquals(new int[]{100, 600, 1000, 2000}, ImageUtil.cropRect(1000, 2000, new OcrPage.Box(100, 600, 1500, 2600)));
    }

    @Test
    public void scaleMakesTextAbout40px() {
        assertEquals(2.0f, ImageUtil.scaleFor(400, 800, 20), 0.01);   // 低解像度は拡大
        assertEquals(1.0f, ImageUtil.scaleFor(800, 1600, 50), 0.01);  // 十分大きければそのまま
        assertEquals(3.0f, ImageUtil.scaleFor(300, 600, 5), 0.01);    // 最大3倍
        assertTrue(ImageUtil.scaleFor(2000, 3000, 10) * 3000 <= 3500.5);  // 長辺3500px以内
    }

    @Test
    public void grayAutoContrastStretches() {
        int[] px = new int[100];
        for (int i = 0; i < 100; i++) { int v = 100 + i / 2; px[i] = 0xFF000000 | (v << 16) | (v << 8) | v; }
        ImageUtil.grayAutoContrast(px);
        int min = 255, max = 0;
        for (int c : px) { int v = c & 0xFF; min = Math.min(min, v); max = Math.max(max, v); assertEquals(v, (c >> 16) & 0xFF); }
        assertTrue(min <= 5);
        assertTrue(max >= 250);
    }
}
