const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Backend timestamps are UTC ISO strings without a timezone suffix (e.g.
 * "2026-10-11T08:15:58.970000"). Date.parse would read those as local time, so
 * treat them as UTC — otherwise the day/time labels drift by the local offset.
 */
export function parseAnnouncementTimestamp(value?: string | null): number {
  if (!value) return Date.now();
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/** "Today" / "Yesterday" / "Tomorrow", else a short date (e.g. "Mon, Oct 6"). */
export function announcementDayLabel(value?: string | null, now: number = Date.now()): string {
  const ts = parseAnnouncementTimestamp(value);
  const diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  return new Date(ts).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Local clock time, e.g. "9:05 AM". */
export function announcementTimeLabel(value?: string | null): string {
  return new Date(parseAnnouncementTimestamp(value)).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
