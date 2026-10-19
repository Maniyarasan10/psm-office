import { Task, TaskPriority, TaskStatus } from '../types';
import { colors } from '../theme';
import { formatShortDate } from '../hooks/useHomeData';

export type TaskStatusFilter = 'All' | TaskStatus;
export type TaskPriorityFilter = 'All' | TaskPriority;
export type TaskDueFilter = 'All' | 'Overdue' | 'Today' | 'Upcoming' | 'No deadline';

export interface TaskFilters {
  status: TaskStatusFilter;
  priority: TaskPriorityFilter;
  due: TaskDueFilter;
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  status: 'All',
  priority: 'All',
  due: 'All',
};

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'none';

export interface DueInfo {
  label: string;
  tone: DueTone;
  icon: string;
}

export interface TaskSection {
  key: string;
  title: string;
  data: Task[];
}

export interface TaskSummary {
  total: number;
  overdue: number;
  dueToday: number;
  upcoming: number;
  noDeadline: number;
}

export interface StatusCounts {
  All: number;
  Pending: number;
  'In Progress': number;
  Completed: number;
}

export interface StatusAction {
  label: string;
  nextStatus: TaskStatus;
  requiresConfirm: boolean;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRIORITY_RANK: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };

const DATE_PART_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's date in the device's local timezone as YYYY-MM-DD. */
export function currentLocalIso(date: Date = new Date()): string {
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
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
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

function dayDiff(fromIso: string, toIso: string): number | null {
  const from = parseDatePart(fromIso);
  const to = parseDatePart(toIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** The YYYY-MM-DD portion of a deadline, or null when it cannot be interpreted as a date. */
export function deadlinePart(task: Task): string | null {
  if (!task.deadline) return null;
  const part = task.deadline.slice(0, 10);
  return parseDatePart(part) ? part : null;
}

export function isOpenTask(task: Task): boolean {
  return task.status !== 'Completed';
}

export function dueInfo(deadline: string | undefined | null, today: string): DueInfo {
  if (!deadline) {
    return { label: 'No deadline', tone: 'none', icon: 'calendar-blank-outline' };
  }
  const part = deadline.slice(0, 10);
  const diff = dayDiff(today, part);
  if (diff == null) {
    return { label: `Due ${deadline}`, tone: 'normal', icon: 'calendar-outline' };
  }
  if (diff < 0) {
    const days = Math.abs(diff);
    return {
      label: days === 1 ? 'Overdue · 1 day' : `Overdue · ${days} days`,
      tone: 'overdue',
      icon: 'alert-circle-outline',
    };
  }
  if (diff === 0) return { label: 'Due today', tone: 'today', icon: 'clock-outline' };
  if (diff === 1) return { label: 'Due tomorrow', tone: 'soon', icon: 'calendar-clock' };
  if (diff <= 6) return { label: `Due in ${diff} days`, tone: 'soon', icon: 'calendar-clock' };
  return { label: `Due ${formatShortDate(part)}`, tone: 'normal', icon: 'calendar-outline' };
}

export function dueColor(tone: DueTone): string {
  switch (tone) {
    case 'overdue':
      return colors.warning;
    case 'today':
      return colors.primary;
    case 'soon':
      return colors.info;
    default:
      return colors.textSecondary;
  }
}

export interface PriorityMeta {
  label: string;
  color: string;
  icon: string;
}

export function priorityMeta(priority: TaskPriority | string): PriorityMeta {
  switch (priority) {
    case 'High':
      return { label: 'High priority', color: colors.error, icon: 'flag-variant' };
    case 'Medium':
      return { label: 'Medium priority', color: colors.textSecondary, icon: 'flag-variant-outline' };
    case 'Low':
      return { label: 'Low priority', color: colors.textMuted, icon: 'flag-variant-outline' };
    default:
      return { label: `${priority} priority`, color: colors.textSecondary, icon: 'flag-variant-outline' };
  }
}

export function statusIcon(status: TaskStatus | string): string {
  switch (status) {
    case 'In Progress':
      return 'progress-check';
    case 'Completed':
      return 'check-circle-outline';
    case 'Pending':
      return 'circle-outline';
    default:
      return 'circle-outline';
  }
}

/** Full, readable date for a deadline, e.g. "Mon, Oct 6, 2025". */
export function formatDeadlineLong(deadline: string | undefined | null): string {
  if (!deadline) return 'No deadline set';
  const part = deadline.slice(0, 10);
  const date = parseDatePart(part);
  if (!date) return deadline;
  const weekday = WEEKDAYS_SHORT[date.getDay()];
  const month = MONTHS_SHORT[date.getMonth()];
  return `${weekday}, ${month} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Formats a backend ISO timestamp without shifting its wall-clock time. */
export function formatTimestamp(iso: string | undefined | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const year = match[1];
  const month = MONTHS_SHORT[Number(match[2]) - 1] ?? match[2];
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = match[5];
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${month} ${day}, ${year} · ${hour12}:${minute} ${period}`;
}

export function summarizeTasks(tasks: Task[], today: string): TaskSummary {
  const summary: TaskSummary = {
    total: tasks.length,
    overdue: 0,
    dueToday: 0,
    upcoming: 0,
    noDeadline: 0,
  };
  tasks.forEach(task => {
    if (!isOpenTask(task)) return;
    const part = deadlinePart(task);
    if (!part) {
      summary.noDeadline += 1;
      return;
    }
    const diff = dayDiff(today, part);
    if (diff == null) return;
    if (diff < 0) summary.overdue += 1;
    else if (diff === 0) summary.dueToday += 1;
    else summary.upcoming += 1;
  });
  return summary;
}

export function statusCounts(tasks: Task[]): StatusCounts {
  const counts: StatusCounts = { All: tasks.length, Pending: 0, 'In Progress': 0, Completed: 0 };
  tasks.forEach(task => {
    if (task.status === 'Pending') counts.Pending += 1;
    else if (task.status === 'In Progress') counts['In Progress'] += 1;
    else if (task.status === 'Completed') counts.Completed += 1;
  });
  return counts;
}

function matchesSearch(task: Task, query: string): boolean {
  if (!query) return true;
  const haystack = [task.title, task.description, task.remarks, task.assigned_to_name]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function matchesDue(task: Task, due: TaskDueFilter, today: string): boolean {
  if (due === 'All') return true;
  const part = deadlinePart(task);
  if (!isOpenTask(task)) return false;
  switch (due) {
    case 'Overdue':
      return !!part && part < today;
    case 'Today':
      return part === today;
    case 'Upcoming':
      return !!part && part > today;
    case 'No deadline':
      return !part;
    default:
      return true;
  }
}

export function applyTaskFilters(
  tasks: Task[],
  filters: TaskFilters,
  query: string,
  today: string
): Task[] {
  const normalizedQuery = query.trim().toLowerCase();
  return tasks.filter(task => {
    if (filters.status !== 'All' && task.status !== filters.status) return false;
    if (filters.priority !== 'All' && task.priority !== filters.priority) return false;
    if (!matchesDue(task, filters.due, today)) return false;
    return matchesSearch(task, normalizedQuery);
  });
}

export function activeFilterCount(filters: TaskFilters): number {
  let count = 0;
  if (filters.status !== 'All') count += 1;
  if (filters.priority !== 'All') count += 1;
  if (filters.due !== 'All') count += 1;
  return count;
}

function compareTasks(a: Task, b: Task): number {
  const aDue = deadlinePart(a);
  const bDue = deadlinePart(b);
  if (aDue && bDue && aDue !== bDue) return aDue < bDue ? -1 : 1;
  if (aDue && !bDue) return -1;
  if (!aDue && bDue) return 1;
  const priorityDiff = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
  if (priorityDiff !== 0) return priorityDiff;
  return a.title.localeCompare(b.title);
}

/** Groups tasks for scanning. Empty groups are omitted. */
export function buildTaskSections(tasks: Task[], today: string): TaskSection[] {
  const overdue: Task[] = [];
  const dueToday: Task[] = [];
  const upcoming: Task[] = [];
  const noDeadline: Task[] = [];
  const completed: Task[] = [];

  tasks.forEach(task => {
    if (!isOpenTask(task)) {
      completed.push(task);
      return;
    }
    const part = deadlinePart(task);
    if (!part) noDeadline.push(task);
    else if (part < today) overdue.push(task);
    else if (part === today) dueToday.push(task);
    else upcoming.push(task);
  });

  const sections: TaskSection[] = [
    { key: 'today', title: 'Today', data: dueToday.sort(compareTasks) },
    { key: 'overdue', title: 'Overdue', data: overdue.sort(compareTasks) },
    { key: 'upcoming', title: 'Upcoming', data: upcoming.sort(compareTasks) },
    { key: 'no-deadline', title: 'No deadline', data: noDeadline.sort(compareTasks) },
    { key: 'completed', title: 'Completed', data: completed.sort((a, b) => b.title.localeCompare(a.title)) },
  ];

  return sections.filter(section => section.data.length > 0);
}

/**
 * The status transition available to an employee for a task, based on the
 * statuses the backend supports (Pending / In Progress / Completed).
 */
export function nextStatusAction(task: Task): StatusAction | null {
  switch (task.status) {
    case 'Pending':
      return { label: 'Start task', nextStatus: 'In Progress', requiresConfirm: false };
    case 'In Progress':
      return { label: 'Mark complete', nextStatus: 'Completed', requiresConfirm: true };
    case 'Completed':
      return { label: 'Reopen task', nextStatus: 'In Progress', requiresConfirm: false };
    default:
      return null;
  }
}
