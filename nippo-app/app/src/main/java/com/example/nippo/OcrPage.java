package com.example.nippo;

import java.util.ArrayList;
import java.util.List;

/** OCRエンジンに依存しない読み取り結果(行と単語、位置)。 */
public class OcrPage {
    public static class Box {
        public final int l, t, r, b;
        public Box(int l, int t, int r, int b) { this.l = l; this.t = t; this.r = r; this.b = b; }
        public float cx() { return (l + r) / 2f; }
        public float cy() { return (t + b) / 2f; }
        public int w() { return r - l; }
        public int h() { return b - t; }
        public Box union(Box o) {
            return o == null ? this : new Box(Math.min(l, o.l), Math.min(t, o.t), Math.max(r, o.r), Math.max(b, o.b));
        }
    }

    public static class Word {
        public final String text;
        public final Box box;
        public Word(String text, Box box) { this.text = text; this.box = box; }
    }

    public static class Line {
        public final String text;
        public final Box box;
        public final List<Word> words;
        /** 行の傾き(度)。OCRが返さなければ NaN。 */
        public float angle = Float.NaN;
        public Line(String text, Box box, List<Word> words) { this.text = text; this.box = box; this.words = words; }
    }

    public final List<Line> lines = new ArrayList<>();
    public String text = "";
    public int width, height;
}
