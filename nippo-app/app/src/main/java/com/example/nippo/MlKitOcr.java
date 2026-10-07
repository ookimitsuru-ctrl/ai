package com.example.nippo;

import android.graphics.Rect;
import com.google.mlkit.vision.text.Text;
import java.util.ArrayList;
import java.util.List;

/** ML Kit の認識結果を OcrPage に変換する。 */
public class MlKitOcr {
    public static OcrPage toPage(Text t, int width, int height) {
        OcrPage p = new OcrPage();
        p.text = t.getText();
        p.width = width; p.height = height;
        for (Text.TextBlock b : t.getTextBlocks())
            for (Text.Line l : b.getLines()) {
                Rect lr = l.getBoundingBox();
                if (lr == null) continue;
                List<OcrPage.Word> words = new ArrayList<>();
                for (Text.Element e : l.getElements()) {
                    Rect er = e.getBoundingBox();
                    if (er != null) words.add(new OcrPage.Word(e.getText(), box(er)));
                }
                OcrPage.Line line = new OcrPage.Line(l.getText(), box(lr), words);
                line.angle = l.getAngle();
                p.lines.add(line);
            }
        return p;
    }

    private static OcrPage.Box box(Rect r) { return new OcrPage.Box(r.left, r.top, r.right, r.bottom); }
}
