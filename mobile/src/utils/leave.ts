export const LEAVE_TYPES = ['Casual', 'Sick', 'Emergency', 'Annual'] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

export function isLeaveType(value: string): value is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(value);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DATE_PART_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's date in the device's local timezone as YYYY-MM-DD. */
export function todayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDatePart(datePart: string): Date | null {
  const match = DATE_PART_PATTERN.exec(datePart);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidLeaveDate(value: string): boolean {
  return parseDatePart(value) !== null;
}

/** Add whole months to a date, clamping the day to the target month's length. */
export function addMonths(iso: string, delta: number): string {
  const base = parseDatePart(iso);
  if (!base) return iso;
  const year = base.getFullYear();
  const monthIndex = base.getMonth() + delta;
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const targetYear = year + Math.floor((monthIndex - targetMonth) / 12);
  const daysInTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(base.getDate(), daysInTarget);
  return toIso(new Date(targetYear, targetMonth, day));
}

/** Whole days between two date-only values (positive when toIso is after fromIso). */
export function dayDiff(fromIso: string, toIso: string): number {
  const from = parseDatePart(fromIso);
  const to = parseDatePart(toIso);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** Add whole days to a date-only value, clamped by the calendar month rollover. */
export function addDays(iso: string, delta: number): string {
  const base = parseDatePart(iso);
  if (!base) return iso;
  base.setDate(base.getDate() + delta);
  return toIso(base);
}

/** Number of days in an inclusive date range. */
export function leaveDayCount(startIso: string, endIso: string): number {
  return dayDiff(startIso, endIso) + 1;
}

/** Earliest date for which leave can be recorded: twelve months back from today. */
export function minLeaveDate(today: string = todayIso()): string {
  return addMonths(today, -12);
}

/** Latest date for which leave can be applied: twelve months ahead of today. */
export function maxLeaveDate(today: string = todayIso()): string {
  return addMonths(today, 12);
}

export function monthKeyOf(iso: string): string {
  const parsed = parseDatePart(iso);
  if (!parsed) return todayIso().slice(0, 7);
  return iso.slice(0, 7);
}

/** "October 2026" from a YYYY-MM-DD date or a YYYY-MM month key. */
export function formatMonthTitle(value: string): string {
  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || month < 1 || month > 12) return '';
  return `${MONTHS[month - 1]} ${year}`;
}

export function weekdayHeaders(): string[] {
  return WEEKDAY_HEADERS;
}

/** 7-column grid for a month (0-based month), with nulls filling leading/trailing blanks. */
export function monthMatrix(year: number, month: number): Array<Array<string | null>> {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toIso(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** "Oct 3" */
export function formatDateMedium(iso: string): string {
  const parsed = parseDatePart(iso);
  if (!parsed) return iso;
  return `${MONTHS_SHORT[parsed.getMonth()]} ${parsed.getDate()}`;
}

/** "Oct 3, 2026" */
export function formatDateField(iso: string): string {
  const parsed = parseDatePart(iso);
  if (!parsed) return iso;
  return `${MONTHS_SHORT[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

/** "Monday, October 3, 2026" */
export function formatDateLong(iso: string): string {
  const parsed = parseDatePart(iso);
  if (!parsed) return iso;
  return `${WEEKDAYS[parsed.getDay()]}, ${MONTHS[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

/** "Oct 3 – Oct 5, 2026" — includes the year only when it differs from the current year. */
export function formatRange(startIso: string, endIso: string): string {
  const start = parseDatePart(startIso);
  const end = parseDatePart(endIso);
  if (!start || !end) return `${startIso} – ${endIso}`;
  const now = new Date();
  const showYear = (iso: string): string => {
    const parsed = parseDatePart(iso);
    if (!parsed) return iso;
    return parsed.getFullYear() === now.getFullYear()
      ? formatDateMedium(iso)
      : formatDateField(iso);
  };
  return `${showYear(startIso)} – ${showYear(endIso)}`;
}

export interface LeaveDateValidation {
  ok: boolean;
  error?: string;
}

/**
 * Client-side guard for the date range. Past leave can be recorded up to twelve
 * months back; future leave can be applied for up to twelve months ahead.
 */
export function validateLeaveDates(startIso: string, endIso: string, today: string): LeaveDateValidation {
  if (!isValidLeaveDate(startIso) || !isValidLeaveDate(endIso)) {
    return { ok: false, error: 'Select a start and end date.' };
  }
  if (endIso < startIso) {
    return { ok: false, error: "End date can't be before the start date." };
  }
  if (startIso < minLeaveDate(today) || endIso > maxLeaveDate(today)) {
    return { ok: false, error: 'Leave dates must be within 12 months of today.' };
  }
  return { ok: true };
}