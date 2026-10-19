import { AttendanceRecord } from '../types';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface MonthStats {
  key: string;
  present: number;
  absent: number;
  late: number;
  remote: number;
  office: number;
  worked: number;
  totalDays: number;
  totalHours: number;
  avgHours: number;
  attendanceRate: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  value: number;
}

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export function monthKeyOfDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string, short = true): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return short ? `${MONTHS_SHORT[month - 1]} ${year}` : `${MONTHS_SHORT[month - 1]}`;
}

export function computeMonthStats(
  records: AttendanceRecord[],
  monthKey: string
): MonthStats {
  const monthRecords = records.filter(record => record.date.slice(0, 7) === monthKey);

  let present = 0;
  let absent = 0;
  let late = 0;
  let remote = 0;
  let office = 0;
  let totalHours = 0;
  let hoursSamples = 0;

  for (const record of monthRecords) {
    switch (record.status) {
      case 'Present':
        present += 1;
        break;
      case 'Absent':
        absent += 1;
        break;
      case 'Late':
        late += 1;
        break;
      case 'Remote':
        remote += 1;
        break;
      case 'Office':
        office += 1;
        break;
      default:
        break;
    }
    if (record.working_hours != null) {
      totalHours += record.working_hours;
      hoursSamples += 1;
    }
  }

  const worked = present + late + remote + office;
  const totalDays = monthRecords.length;

  return {
    key: monthKey,
    present,
    absent,
    late,
    remote,
    office,
    worked,
    totalDays,
    totalHours: Math.round(totalHours * 100) / 100,
    avgHours: hoursSamples > 0 ? Math.round((totalHours / hoursSamples) * 100) / 100 : 0,
    attendanceRate: totalDays > 0 ? Math.round((worked / totalDays) * 1000) / 10 : 0,
  };
}

export function buildMonthlyTrend(
  records: AttendanceRecord[],
  months = 6,
  endMonthKey: string = currentMonthKey()
): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const key = shiftMonthKey(endMonthKey, -offset);
    const stats = computeMonthStats(records, key);
    points.push({ key, label: monthLabel(key, false), value: stats.worked });
  }
  return points;
}
