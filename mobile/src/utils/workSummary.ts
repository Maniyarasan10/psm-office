import { AttendanceRecord, Task } from '../types';
import { buildTaskSections, deadlinePart, isOpenTask } from './tasks';
import { dayDiff } from './leave';

export type MetricTone = 'primary' | 'info' | 'warning' | 'success' | 'neutral';

export function metricValue(metrics: WorkMetric[], key: string): number {
  return metrics.find(metric => metric.key === key)?.value ?? 0;
}

/**
 * One headline number on the work summary. Values are plain counts of records
 * the backend already stores — no rates, scores or rankings are derived here.
 */
export interface WorkMetric {
  key: string;
  label: string;
  value: number;
  tone: MetricTone;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface MonthAttendance {
  monthKey: string;
  counts: StatusCount[];
  recorded: number;
}

export interface AbsenceWindow {
  windowDays: number;
  count: number;
  /** Most recent absence date inside the window, or null when there is none. */
  latestDate: string | null;
}

const MONTH_STATUS_ORDER = ['Present', 'Remote', 'Office', 'Late', 'Absent'];

/**
 * Compact task metrics for the summary header: what is active, what is urgent
 * and what has been finished. Completed tasks never count as overdue.
 */
export function buildWorkMetrics(tasks: Task[], today: string): WorkMetric[] {
  let inProgress = 0;
  let dueToday = 0;
  let overdue = 0;
  let completed = 0;

  tasks.forEach(task => {
    if (!isOpenTask(task)) {
      completed += 1;
      return;
    }
    if (task.status === 'In Progress') inProgress += 1;
    const part = deadlinePart(task);
    if (!part) return;
    const diff = dayDiff(today, part);
    if (diff < 0) overdue += 1;
    else if (diff === 0) dueToday += 1;
  });

  return [
    { key: 'in-progress', label: 'In progress', value: inProgress, tone: 'info' },
    { key: 'due-today', label: 'Due today', value: dueToday, tone: 'primary' },
    { key: 'overdue', label: 'Overdue', value: overdue, tone: 'warning' },
    { key: 'completed', label: 'Completed', value: completed, tone: 'success' },
  ];
}

/**
 * The tasks worth looking at first: overdue, then due today, then upcoming,
 * then open work without a deadline. Reuses the Tasks module's grouping so
 * both screens agree on what "overdue" means.
 */
export function openTasksOrdered(tasks: Task[], today: string): Task[] {
  const ordered: Task[] = [];
  buildTaskSections(tasks, today).forEach(section => {
    if (section.key === 'completed') return;
    section.data.forEach(task => ordered.push(task));
  });
  return ordered;
}

/** Overdue and due-today work only, oldest deadline first. */
export function attentionTasks(tasks: Task[], today: string, limit: number): Task[] {
  const urgent: Task[] = [];
  buildTaskSections(tasks, today).forEach(section => {
    if (section.key !== 'overdue' && section.key !== 'today') return;
    section.data.forEach(task => urgent.push(task));
  });
  return urgent.slice(0, limit);
}

/** Most recently touched completed work. No completion date is invented — the
 * backend only stores the last time a task record was written. */
export function recentCompleted(tasks: Task[], limit: number): Task[] {
  const stamp = (task: Task): string => task.updated_at ?? task.created_at ?? '';
  return tasks
    .filter(task => !isOpenTask(task))
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))
    .slice(0, limit);
}

/**
 * Attendance statuses recorded for a calendar month, in a stable display
 * order, with zero-count statuses omitted. Counts are reported exactly as the
 * backend stored them — statuses are never merged into an "attendance score".
 */
export function monthAttendance(records: AttendanceRecord[], monthKey: string): MonthAttendance {
  const bucket = new Map<string, number>();
  records.forEach(record => {
    if (!record.date || record.date.slice(0, 7) !== monthKey) return;
    bucket.set(record.status, (bucket.get(record.status) ?? 0) + 1);
  });

  const counts: StatusCount[] = [];
  MONTH_STATUS_ORDER.forEach(status => {
    const count = bucket.get(status);
    if (count) {
      counts.push({ status, count });
      bucket.delete(status);
    }
  });
  bucket.forEach((count, status) => {
    if (count > 0) counts.push({ status, count });
  });

  return {
    monthKey,
    counts,
    recorded: counts.reduce((total, entry) => total + entry.count, 0),
  };
}

/**
 * Absence days recorded inside the trailing window. Absence includes requested
 * leave and days that were never marked, which is how the Leave screen
 * describes it too.
 */
export function absencesInWindow(
  records: AttendanceRecord[],
  today: string,
  windowDays: number
): AbsenceWindow {
  let count = 0;
  let latestDate: string | null = null;

  records.forEach(record => {
    if (record.status !== 'Absent' || !record.date || record.date > today) return;
    const age = dayDiff(record.date, today);
    if (age < 0 || age >= windowDays) return;
    count += 1;
    if (!latestDate || record.date > latestDate) latestDate = record.date;
  });

  return { windowDays, count, latestDate };
}
