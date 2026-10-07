package com.example.nippo;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** テスト用: Tesseract の TSV 出力(実際の日報写真を読んだもの)を OcrPage に変換する。 */
public class TsvOcr {
    public static OcrPage load(String name) throws Exception {
        InputStream in = TsvOcr.class.getResourceAsStream("/ocr/" + name);
        if (in == null) throw new IllegalArgumentException(name);
        OcrPage p = new OcrPage();
        Map<String, List<OcrPage.Word>> lines = new LinkedHashMap<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String row;
            boolean header = true;
            while ((row = r.readLine()) != null) {
                if (header) { header = false; continue; }
                String[] c = row.split("\t", -1);
                if (c.length < 12) continue;
                int level = Integer.parseInt(c[0]);
                int l = Integer.parseInt(c[6]), t = Integer.parseInt(c[7]), w = Integer.parseInt(c[8]), h = Integer.parseInt(c[9]);
                if (level == 1) { p.width = w; p.height = h; }
                if (level != 5 || c[11].trim().isEmpty()) continue;
                String key = c[2] + "/" + c[3] + "/" + c[4];
                lines.computeIfAbsent(key, k -> new ArrayList<>()).add(new OcrPage.Word(c[11], new OcrPage.Box(l, t, l + w, t + h)));
            }
        }
        StringBuilder all = new StringBuilder();
        for (List<OcrPage.Word> ws : lines.values()) {
            StringBuilder sb = new StringBuilder();
            OcrPage.Box box = null;
            for (OcrPage.Word w : ws) {
                if (sb.length() > 0) sb.append(' ');
                sb.append(w.text);
                box = w.box.union(box);
            }
            p.lines.add(new OcrPage.Line(sb.toString(), box, ws));
            all.append(sb).append('\n');
        }
        p.text = all.toString();
        return p;
    }
}
