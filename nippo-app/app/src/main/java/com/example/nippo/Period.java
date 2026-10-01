package com.example.nippo;

import java.time.LocalDate;

/**
 * 「○月度」の期間。基本は 前月16日〜当月15日(例: 9/16〜10/15 = 10月度)。
 * 例外: 1月度=12/16〜1/14、2月度=1/15〜2/13、3月度=2/14〜3/15。
 */
public class Period {
    public final int year, month;          // 年度の年・○月度
    public final LocalDate start, end;

    private Period(int year, int month) {
        this.year = year; this.month = month;
        switch (month) {
            case 1:  start = LocalDate.of(year - 1, 12, 16); end = LocalDate.of(year, 1, 14); break;
            case 2:  start = LocalDate.of(year, 1, 15);      end = LocalDate.of(year, 2, 13); break;
            case 3:  start = LocalDate.of(year, 2, 14);      end = LocalDate.of(year, 3, 15); break;
            default: start = LocalDate.of(year, month - 1, 16); end = LocalDate.of(year, month, 15);
        }
    }

    public static Period of(int year, int month) { return new Period(year, month); }

    public static Period containing(LocalDate d) {
        for (int y = d.getYear(); y <= d.getYear() + 1; y++)
            for (int m = 1; m <= 12; m++) {
                Period p = new Period(y, m);
                if (!d.isBefore(p.start) && !d.isAfter(p.end)) return p;
            }
        throw new IllegalStateException("no period for " + d);
    }

    public Period prev() { return month == 1 ? new Period(year - 1, 12) : new Period(year, month - 1); }

    public Period next() { return month == 12 ? new Period(year + 1, 1) : new Period(year, month + 1); }

    public String label() { return year + "年" + month + "月度"; }

    public String range() {
        return start.getMonthValue() + "/" + start.getDayOfMonth() + "〜" + end.getMonthValue() + "/" + end.getDayOfMonth();
    }
}
