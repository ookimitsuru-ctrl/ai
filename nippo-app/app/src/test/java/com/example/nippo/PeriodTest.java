package com.example.nippo;

import static org.junit.Assert.*;

import java.time.LocalDate;
import org.junit.Test;

public class PeriodTest {
    private static void chk(int y, int m, int d, int degYear, int degMonth, String range) {
        Period p = Period.containing(LocalDate.of(y, m, d));
        assertEquals(y + "-" + m + "-" + d, degMonth, p.month);
        assertEquals(y + "-" + m + "-" + d, degYear, p.year);
        assertEquals(range, p.range());
    }

    @Test
    public void rules() {
        chk(2026, 9, 16, 2026, 10, "9/16〜10/15");     // 9/16〜10/15 = 10月度
        chk(2026, 10, 15, 2026, 10, "9/16〜10/15");
        chk(2026, 10, 16, 2026, 11, "10/16〜11/15");
        chk(2026, 11, 16, 2026, 12, "11/16〜12/15");
        chk(2026, 12, 15, 2026, 12, "11/16〜12/15");
        chk(2026, 12, 16, 2027, 1, "12/16〜1/14");     // 1月度(例外)
        chk(2027, 1, 14, 2027, 1, "12/16〜1/14");
        chk(2027, 1, 15, 2027, 2, "1/15〜2/13");       // 2月度(例外)
        chk(2027, 2, 13, 2027, 2, "1/15〜2/13");
        chk(2027, 2, 14, 2027, 3, "2/14〜3/15");       // 3月度(例外)
        chk(2027, 3, 15, 2027, 3, "2/14〜3/15");
        chk(2027, 3, 16, 2027, 4, "3/16〜4/15");       // 4月度以降は基本ルール
        chk(2027, 8, 16, 2027, 9, "8/16〜9/15");
    }

    @Test
    public void prevNextAreContiguous() {
        Period p = Period.containing(LocalDate.of(2026, 10, 1));
        assertEquals("2026年10月度", p.label());
        assertEquals("2026年9月度", p.prev().label());
        assertEquals(p.start.minusDays(1), p.prev().end);
        assertEquals(p.end.plusDays(1), p.next().start);
        Period dec = Period.of(2026, 12);
        assertEquals("2027年1月度", dec.next().label());
        assertEquals(dec.end.plusDays(1), dec.next().start);
        assertEquals(Period.of(2027, 1).end.plusDays(1), Period.of(2027, 2).start);
        assertEquals(Period.of(2027, 2).end.plusDays(1), Period.of(2027, 3).start);
        assertEquals(Period.of(2027, 3).end.plusDays(1), Period.of(2027, 4).start);
        assertEquals("2026年12月度", Period.of(2027, 1).prev().label());
    }
}
