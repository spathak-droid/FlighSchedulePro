/**
 * Time conversion utilities for FSP integration.
 *
 * CRITICAL: FSP reservation times are **local time** with no timezone suffix.
 * Sending UTC with a "Z" suffix will cause silent data corruption.
 */

/**
 * Pad a number to 2 digits.
 */
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Convert a `Date` (which is internally UTC) to an FSP local-time string.
 *
 * The caller is responsible for ensuring the Date already represents the
 * correct wall-clock time in the operator's timezone. If you have a UTC
 * instant and a timezone name, use `fromUtcToFspLocal` instead.
 *
 * @returns  `"YYYY-MM-DDTHH:mm"` — **no timezone suffix**
 */
export function toFspLocalTime(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Convert a UTC `Date` to an FSP local-time string in the given IANA timezone.
 *
 * Uses `Intl.DateTimeFormat` to resolve the wall-clock components, so this
 * works correctly across DST boundaries with no third-party dependencies.
 *
 * @param utcDate   A Date representing a UTC instant.
 * @param timezone  IANA timezone, e.g. `"America/Chicago"`.
 * @returns  `"YYYY-MM-DDTHH:mm"` — **no timezone suffix**
 */
export function fromUtcToFspLocal(utcDate: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(utcDate);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '00';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  const minute = get('minute');

  // Intl may return "24" for midnight in some locales; normalize to "00"
  if (hour === '24') {
    hour = '00';
  }

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Parse an FSP local-time string (with no timezone suffix) and interpret it
 * in the given IANA timezone, returning a proper `Date` (UTC-based).
 *
 * @param fspTime   `"YYYY-MM-DDTHH:mm"` or `"YYYY-MM-DDTHH:mm:ss"`
 * @param timezone  IANA timezone, e.g. `"America/New_York"`
 * @returns  A `Date` whose `.toISOString()` is the UTC equivalent.
 */
export function fromFspTime(fspTime: string, timezone: string): Date {
  // Extract components from the FSP time string
  const match = fspTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(
      `Invalid FSP time format: "${fspTime}". Expected "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss".`,
    );
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = secondStr ? Number(secondStr) : 0;

  // Strategy: create a UTC date at the same wall-clock time, then figure out
  // the timezone offset by comparing what Intl says the wall-clock time is
  // in that timezone for a nearby UTC instant.

  // Start with a rough UTC guess
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  // Get what the local time would be in the target timezone at that UTC instant
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(guessUtc);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const val = parts.find((p) => p.type === type)?.value ?? '0';
    return Number(val === '24' ? '0' : val);
  };

  const localAtGuess = new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')),
  );

  // The offset = localAtGuess(UTC encoding) - guessUtc
  const offsetMs = localAtGuess.getTime() - guessUtc.getTime();

  // The actual UTC time = guessUtc - offset
  return new Date(guessUtc.getTime() - offsetMs);
}

/**
 * Get the wall-clock components of a Date in a specific timezone.
 *
 * @param date     A Date (UTC-based internally).
 * @param timezone IANA timezone, e.g. `"America/Los_Angeles"`.
 * @returns Object with year, month, day, hour, minute, second, dayOfWeek in local time.
 */
export function getLocalParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number; dayOfWeek: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '0';

  let hour = Number(get('hour') === '24' ? '0' : get('hour'));

  const weekdayStr = get('weekday');
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    dayOfWeek: dayMap[weekdayStr] ?? 0,
  };
}

/**
 * Create a Date (UTC-based) representing a specific wall-clock time
 * on a specific date in a given timezone.
 *
 * @param dateStr  Date as "YYYY-MM-DD".
 * @param hour     Local hour (0-23).
 * @param minute   Local minute (0-59).
 * @param timezone IANA timezone.
 * @returns A proper UTC Date for that local wall-clock time.
 */
export function localTimeToUtcDate(dateStr: string, hour: number, minute: number, timezone: string): Date {
  const fspTime = `${dateStr}T${pad(hour)}:${pad(minute)}:00`;
  return fromFspTime(fspTime, timezone);
}

/**
 * Format a Date in a specific timezone for display.
 *
 * @param date     A Date (UTC-based internally).
 * @param timezone IANA timezone.
 * @param options  Intl.DateTimeFormat options.
 * @returns Formatted string in the given timezone.
 */
export function formatInTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...options }).format(date);
}

/**
 * Determine whether a given Date falls within civil twilight (daylight) hours.
 *
 * FSP civil twilight comes as two ISO-ish date-time strings representing the
 * start (dawn) and end (dusk) of civil twilight on a given day, in the
 * location's local time.
 *
 * @param date      The Date to test (UTC-based).
 * @param twilight  `{ startDate, endDate }` as returned by the FSP civil
 *                  twilight endpoint. Both strings are in FSP local time
 *                  format.
 * @param timezone  IANA timezone of the location.
 * @returns `true` if the date falls between the twilight start and end.
 */
export function isWithinDaylightHours(
  date: Date,
  twilight: { startDate: string; endDate: string },
  timezone: string,
): boolean {
  const dawn = fromFspTime(twilight.startDate, timezone);
  const dusk = fromFspTime(twilight.endDate, timezone);
  const ts = date.getTime();

  return ts >= dawn.getTime() && ts <= dusk.getTime();
}
