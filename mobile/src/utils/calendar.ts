import { BirthdayEntry, CalendarDayItem, CalendarItemKind, Task } from '../types';
import { colors } from '../theme';
import { addDays, addMonths, dayDiff, formatDateField, formatDateLong, monthKeyOf, todayIso } from './leave';
import { deadlinePart, dueInfo, isOpenTask } from './tasks';

/** Attendance records are returned newest-first; this covers ~6 months of marks. */
export const CALENDAR_LEAVE_WINDOW = 180;

/** The birthdays endpoint only returns the next occurrence inside this window. */
export const CALENDAR_BIRTHDAY_WINDOW = 366;

/** Home pulls a short birthday window so the summary stays cheap. */
export const HOME_BIRTHDAY_WINDOW = 45;

/** Maximum rows rendered in the "Upcoming" list. */
export const UPCOMING_LIMIT = 8;

export interface CalendarKindMeta {
  /** Full label used by detail screens and screen readers. */
  label: string;
  /** Short label used by the legend. */
  legend: string;
  icon: string;
  /** Indicator / icon colour. */
  color: string;
  /** Light background behind the icon tile. */
  tint: string;
}

/**
 * Presentation metadata for the only three kinds of dated information the
 * backend actually provides. Icons are verified against the bundled MDI set.
 */
export const CALENDAR_KIND: Record<CalendarItemKind, CalendarKindMeta> = {
  leave: {
    label: 'Leave / absence',
    legend: 'Leave',
    icon: 'calendar-remove-outline',
    color: colors.secondary,
    tint: colors.backgroundLite,
  },
  task: {
    label: 'Deadline',
    legend: 'Deadline',
    icon: 'clipboard-text-outline',
    color: colors.primary,
    tint: colors.infoLight,
  },
  birthday: {
    label: 'Birthday',
    legend: 'Birthday',
    icon: 'gift-outline',
    color: colors.warning,
    tint: colors.warningLight,
  },
};

const KIND_ORDER: Record<CalendarItemKind, number> = { leave: 0, task: 1, birthday: 2 };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarIndex {
  /** Every item keyed by the single day it is rendered on. */
  byDate: Map<string, CalendarDayItem[]>;
  /** All items ordered by date, then kind. Drives the "Upcoming" list. */
  ordered: CalendarDayItem[];
  /** Days covered by a recorded leave/absence span. */
  leaveDates: Set<string>;
}

export interface CalendarIndexInput {
  tasks: Task[];
  /** YYYY-MM-DD dates whose attendance status is "Absent". */
  absenceDates: string[];
  birthdays: BirthdayEntry[];
  today: string;
}

function compareItems(a: CalendarDayItem, b: CalendarDayItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kindDiff !== 0) return kindDiff;
  return a.title.localeCompare(b.title);
}

/** "Today" / "Tomorrow" / "In 12 days" for a birthday relative to the device date. */
export function relativeDayLabel(targetIso: string, today: string = todayIso()): string {
  const diff = dayDiff(today, targetIso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/**
 * Turns the three backend sources into a read-only index of dated items.
 * Everything the backend provides is date-only, so no times are invented.
 */
export function buildCalendarIndex(input: CalendarIndexInput): CalendarIndex {
  const byDate = new Map<string, CalendarDayItem[]>();
  const leaveDates = new Set<string>();
  const ordered: CalendarDayItem[] = [];

  const push = (item: CalendarDayItem) => {
    ordered.push(item);
    const bucket = byDate.get(item.date);
    if (bucket) bucket.push(item);
    else byDate.set(item.date, [item]);
  };

  // Leave: consecutive "Absent" days are grouped into one span so every day
  // of the span knows where it sits inside it.
  const absences = Array.from(new Set(input.absenceDates)).filter(date => ISO_DATE.test(date)).sort();
  let spanStart = '';
  let spanEnd = '';

  const flushLeaveSpan = () => {
    if (!spanStart) return;
    const total = dayDiff(spanStart, spanEnd) + 1;
    let cursor = spanStart;
    while (cursor <= spanEnd) {
      const position = dayDiff(spanStart, cursor) + 1;
      push({
        id: `leave-${cursor}`,
        kind: 'leave',
        date: cursor,
        title: 'Leave / absence',
        meta: total > 1 ? `Day ${position} of ${total}` : 'Marked absent',
        detail:
          total > 1
            ? `Part of a ${total}-day absence from ${formatDateField(spanStart)} to ${formatDateField(spanEnd)}.`
            : undefined,
        startDate: spanStart,
        endDate: spanEnd,
      });
      leaveDates.add(cursor);
      cursor = addDays(cursor, 1);
    }
    spanStart = '';
    spanEnd = '';
  };

  for (const date of absences) {
    if (!spanStart) {
      spanStart = date;
      spanEnd = date;
      continue;
    }
    if (dayDiff(spanEnd, date) === 1) {
      spanEnd = date;
      continue;
    }
    flushLeaveSpan();
    spanStart = date;
    spanEnd = date;
  }
  flushLeaveSpan();

  // Deadlines: only open tasks can be acted on, so completed work stays off
  // the calendar instead of adding noise.
  input.tasks.forEach(task => {
    if (!isOpenTask(task)) return;
    const date = deadlinePart(task);
    if (!date) return;
    push({
      id: `task-${task._id}`,
      kind: 'task',
      date,
      title: task.title,
      meta: `${task.status} · ${dueInfo(task.deadline, input.today).label}`,
      detail: task.description,
      taskId: task._id,
    });
  });

  // Birthdays: the backend returns only the next occurrence per employee.
  input.birthdays.forEach(entry => {
    const date = entry.birthday;
    if (!ISO_DATE.test(date)) return;
    push({
      id: `birthday-${entry.employee_id}-${date}`,
      kind: 'birthday',
      date,
      title: `${entry.name}'s birthday`,
      meta: relativeDayLabel(date, input.today),
      detail: entry.employee_id ? `Employee ID ${entry.employee_id}` : undefined,
    });
  });

  ordered.sort(compareItems);
  byDate.forEach(items => items.sort(compareItems));

  return { byDate, ordered, leaveDates };
}

export function itemsForDate(index: CalendarIndex, iso: string): CalendarDayItem[] {
  return index.byDate.get(iso) ?? [];
}

/** Items strictly after `fromExclusiveIso`, capped for a compact list. */
export function upcomingItems(index: CalendarIndex, fromExclusiveIso: string, limit: number = UPCOMING_LIMIT): CalendarDayItem[] {
  return index.ordered.filter(item => item.date > fromExclusiveIso).slice(0, limit);
}

/** Move a `YYYY-MM` month key forward or back, reusing the shared date maths. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  return monthKeyOf(addMonths(`${monthKey}-01`, delta));
}

export interface CalendarGroup {
  date: string;
  items: CalendarDayItem[];
}

/** Groups an ordered item list by day, keeping the original order. */
export function groupByDate(items: CalendarDayItem[]): CalendarGroup[] {
  const groups: CalendarGroup[] = [];
  items.forEach(item => {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) {
      last.items.push(item);
      return;
    }
    groups.push({ date: item.date, items: [item] });
  });
  return groups;
}

export interface DayMarker {
  leave: boolean;
  task: boolean;
  birthday: boolean;
  count: number;
}

const EMPTY_MARKER: DayMarker = { leave: false, task: false, birthday: false, count: 0 };

export function markerForDate(index: CalendarIndex, iso: string): DayMarker {
  const items = index.byDate.get(iso);
  if (!items || items.length === 0) return EMPTY_MARKER;
  let leave = false;
  let task = false;
  let birthday = false;
  items.forEach(item => {
    if (item.kind === 'leave') leave = true;
    else if (item.kind === 'task') task = true;
    else birthday = true;
  });
  return { leave, task, birthday, count: items.length };
}

/** Section heading for an agenda day: "Today", "Tomorrow" or a full date. */
export function agendaDateLabel(iso: string, today: string = todayIso()): string {
  const diff = dayDiff(today, iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDateLong(iso);
}

const KIND_SPOKEN: Record<CalendarItemKind, string> = {
  leave: 'leave',
  task: 'deadline',
  birthday: 'birthday',
};

/**
 * Reads a calendar cell out loud: the full date, whether it is today, and
 * what it carries — so colour is never the only signal.
 */
export function dayAccessibilityLabel(
  iso: string,
  marker: DayMarker,
  today: string = todayIso()
): string {
  const parts = [formatDateLong(iso)];
  if (iso === today) parts.push('Today');
  if (marker.count === 0) {
    parts.push('no items');
  } else {
    const kinds: string[] = [];
    if (marker.leave) kinds.push(KIND_SPOKEN.leave);
    if (marker.task) kinds.push(KIND_SPOKEN.task);
    if (marker.birthday) kinds.push(KIND_SPOKEN.birthday);
    parts.push(`${marker.count} item${marker.count === 1 ? '' : 's'}: ${kinds.join(', ')}`);
  }
  return parts.join(', ');
}
