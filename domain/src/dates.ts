/** Local-date helpers. Date keys are YYYY-MM-DD in the local time zone; Dates are pinned to noon to dodge DST. */

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function dateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True for a well-formed date key that is a real calendar date. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** Parses to local noon. Malformed input falls back to 1970-01-01 like the v1 helper. */
export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
}

/** Monday of the week containing `date`, at local noon. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function addWeeks(date: Date, amount: number): Date {
  return addDays(date, amount * 7);
}

export function addDaysToKey(key: string, amount: number): string {
  return dateKey(addDays(parseDateKey(key), amount));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS,
  );
}

/** Inclusive list of date keys from `from` to `to`; empty when `to` is before `from`. */
export function daysInRange(from: string, to: string): string[] {
  const count = daysBetween(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, index) =>
    addDaysToKey(from, index),
  );
}

/** ISO 8601 week number (1-53); weeks start on Monday. */
export function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  return Math.ceil(((target.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** Milliseconds from `now` until the next local midnight (for a midnight tick). */
export function msUntilNextMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

const WEEKDAY_LONG = new Intl.DateTimeFormat("da-DK", { weekday: "long" });
const WEEKDAY_SHORT = new Intl.DateTimeFormat("da-DK", { weekday: "short" });
const MONTH_LONG = new Intl.DateTimeFormat("da-DK", { month: "long" });
const SHORT_DATE = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short" });
const FULL_DATE = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const asDate = (value: Date | string): Date =>
  typeof value === "string" ? parseDateKey(value) : value;

/** "mandag" / "man." */
export function weekdayName(value: Date | string, style: "long" | "short" = "long"): string {
  return (style === "long" ? WEEKDAY_LONG : WEEKDAY_SHORT).format(asDate(value));
}

/** "9. nov." */
export function formatShortDate(value: Date | string): string {
  return SHORT_DATE.format(asDate(value));
}

/** "mandag den 9. november" */
export function formatFullDate(value: Date | string): string {
  return FULL_DATE.format(asDate(value));
}

/**
 * Compact Danish range: "9.–15. november" within a month, "30. november–6. december" across months,
 * a single "9. november" when both ends are the same day.
 */
export function formatDateRange(from: string, to: string): string {
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  const startMonth = MONTH_LONG.format(start);
  const endMonth = MONTH_LONG.format(end);
  if (from === to) return `${start.getDate()}. ${startMonth}`;
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}.–${end.getDate()}. ${endMonth}`;
  }
  return `${start.getDate()}. ${startMonth}–${end.getDate()}. ${endMonth}`;
}
