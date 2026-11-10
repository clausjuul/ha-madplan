/** All server-side "what day is it" logic goes through here, using the household's zone rather than the container's. */

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

type Clock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function clockIn(date: Date, timeZone: string): Clock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** YYYY-MM-DD of `date` as seen on a wall clock in `timeZone`. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  const { year, month, day } = clockIn(date, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Milliseconds until the next midnight on a wall clock in `timeZone` (DST days are corrected by rescheduling). */
export function msUntilMidnightInZone(now: Date, timeZone: string): number {
  const { hour, minute, second } = clockIn(now, timeZone);
  const elapsed = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  return 24 * 60 * 60 * 1000 - elapsed;
}

/** Home Assistant's own configured zone, via the Supervisor proxy. Returns undefined on any problem. */
export async function fetchSupervisorTimeZone(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await fetcher("http://supervisor/core/api/config", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { time_zone?: unknown };
    return typeof body.time_zone === "string" && isValidTimeZone(body.time_zone) ? body.time_zone : undefined;
  } catch {
    return undefined;
  }
}
