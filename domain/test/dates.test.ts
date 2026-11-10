import { describe, expect, it } from "vitest";
import {
  addDays,
  addDaysToKey,
  addWeeks,
  dateKey,
  daysBetween,
  daysInRange,
  formatDateRange,
  formatFullDate,
  formatShortDate,
  isDateKey,
  isoWeekNumber,
  msUntilNextMidnight,
  parseDateKey,
  startOfWeek,
  weekdayName,
} from "../src/index.ts";

describe("date keys", () => {
  it("formats local dates and round-trips through noon", () => {
    const date = new Date(2026, 10, 9, 23, 59);
    expect(dateKey(date)).toBe("2026-11-09");
    const parsed = parseDateKey("2026-11-09");
    expect(parsed.getHours()).toBe(12);
    expect(dateKey(parsed)).toBe("2026-11-09");
  });

  it("validates real calendar dates only", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-2-3")).toBe(false);
    expect(isDateKey(20260203)).toBe(false);
  });

  it("does not drift across the DST change", () => {
    // Europe/Copenhagen switches on 2026-03-29 and 2026-10-25.
    expect(addDaysToKey("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDaysToKey("2026-10-24", 2)).toBe("2026-10-26");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysInRange("2026-10-24", "2026-10-26")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
  });
});

describe("week helpers", () => {
  it("starts weeks on Monday", () => {
    expect(dateKey(startOfWeek(parseDateKey("2026-11-09")))).toBe("2026-11-09");
    expect(dateKey(startOfWeek(parseDateKey("2026-11-15")))).toBe("2026-11-09");
    expect(dateKey(startOfWeek(parseDateKey("2026-11-16")))).toBe("2026-11-16");
  });

  it("adds days and weeks", () => {
    const monday = parseDateKey("2026-11-09");
    expect(dateKey(addDays(monday, 6))).toBe("2026-11-15");
    expect(dateKey(addWeeks(monday, -1))).toBe("2026-11-02");
  });

  it("computes ISO week numbers including year edges", () => {
    expect(isoWeekNumber(parseDateKey("2026-11-09"))).toBe(46);
    expect(isoWeekNumber(parseDateKey("2026-01-01"))).toBe(1);
    expect(isoWeekNumber(parseDateKey("2021-01-03"))).toBe(53);
    expect(isoWeekNumber(parseDateKey("2024-12-30"))).toBe(1);
  });

  it("returns an empty range when the end is before the start", () => {
    expect(daysInRange("2026-11-09", "2026-11-08")).toEqual([]);
    expect(daysInRange("2026-11-09", "2026-11-09")).toEqual(["2026-11-09"]);
  });
});

describe("msUntilNextMidnight", () => {
  it("counts to the next local midnight", () => {
    expect(msUntilNextMidnight(new Date(2026, 10, 9, 23, 0, 0, 0))).toBe(3_600_000);
    expect(msUntilNextMidnight(new Date(2026, 10, 9, 0, 0, 0, 0))).toBe(86_400_000);
    expect(msUntilNextMidnight(new Date(2026, 10, 30, 23, 59, 59, 500))).toBe(500);
  });
});

describe("Danish formatting", () => {
  it("names weekdays", () => {
    expect(weekdayName("2026-11-09")).toBe("mandag");
    expect(weekdayName("2026-11-14", "short")).toMatch(/^lør/u);
  });

  it("formats short and full dates", () => {
    expect(formatShortDate("2026-11-09")).toBe("9. nov.");
    expect(formatFullDate("2026-11-09")).toMatch(/^mandag(?: den)? 9\. november$/u);
  });

  it("formats ranges", () => {
    expect(formatDateRange("2026-11-09", "2026-11-15")).toBe("9.–15. november");
    expect(formatDateRange("2026-11-30", "2026-12-06")).toBe("30. november–6. december");
    expect(formatDateRange("2026-11-09", "2026-11-09")).toBe("9. november");
  });
});
