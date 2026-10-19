import { useCallback, useEffect, useRef, useState } from 'react';
import { AttendanceRecord, Task } from '../types';
import { getAnnouncements, getMyTasks, getPersonAttendance } from '../services/api';

// The home card only needs today's record; 14 days covers the weekend-safety
// window while staying far smaller than the old full-company roster call.
const ATTENDANCE_HISTORY_LIMIT = 14;

export interface HomeData {
  attendance: AttendanceRecord | null;
  tasks: Task[];
  announcement: string;
  loading: boolean;
  refreshing: boolean;
  attendanceError: boolean;
  tasksError: boolean;
  announcementsError: boolean;
  reload: () => void;
  refresh: () => void;
}

interface HomeScope {
  personId: string;
  personType: string;
}

export function useHomeData(scope: HomeScope | null): HomeData {
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);
  const [tasksError, setTasksError] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState(false);

  const requestId = useRef(0);
  const scopeRef = useRef<HomeScope | null>(scope);
  scopeRef.current = scope;

  const run = useCallback(async (mode: 'initial' | 'refresh') => {
    const currentScope = scopeRef.current;
    if (!currentScope) return;

    const id = ++requestId.current;
    if (mode === 'refresh') setRefreshing(true);

    const todayIso = new Date().toISOString().split('T')[0];

    const [attendanceResult, tasksResult, announcementsResult] = await Promise.allSettled([
      getPersonAttendance(currentScope.personId, ATTENDANCE_HISTORY_LIMIT),
      getMyTasks(currentScope.personId, currentScope.personType),
      getAnnouncements(),
    ]);

    if (id !== requestId.current) return;

    if (attendanceResult.status === 'fulfilled') {
      const records = attendanceResult.value.data;
      const todayRecord = records.find(r => r.date === todayIso) ?? null;
      setAttendance(todayRecord);
      setAttendanceError(false);
    } else {
      setAttendanceError(true);
    }

    if (tasksResult.status === 'fulfilled') {
      setTasks(tasksResult.value.data);
      setTasksError(false);
    } else {
      setTasksError(true);
    }

    if (announcementsResult.status === 'fulfilled') {
      setAnnouncement(announcementsResult.value.data?.announcement ?? '');
      setAnnouncementsError(false);
    } else {
      setAnnouncementsError(true);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    void run('initial');
  }, [run]);

  const refresh = useCallback(() => {
    void run('refresh');
  }, [run]);

  useEffect(() => {
    void run('initial');
    return () => {
      requestId.current += 1;
    };
  }, [run]);

  return {
    attendance,
    tasks,
    announcement,
    loading,
    refreshing,
    attendanceError,
    tasksError,
    announcementsError,
    reload,
    refresh,
  };
}

export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function todayLabel(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function timeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const parts = time.split(':').map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

export function format12Hour(time?: string | null): string {
  const minutes = timeToMinutes(time);
  if (minutes == null) return '--:--';
  const hours24 = Math.floor(minutes / 60);
  const minutePart = minutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutePart.toString().padStart(2, '0')} ${period}`;
}

export function formatDuration(decimalHours?: number | null): string {
  if (decimalHours == null || Number.isNaN(decimalHours)) return '--';
  const totalMinutes = Math.max(0, Math.round(decimalHours * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes}m`;
}

export function formatWorkingMinutes(totalMinutes: number | null): string {
  if (totalMinutes == null || totalMinutes < 0) return '--';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes}m`;
}

export function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function relativeDueLabel(deadline: string | undefined, todayIso: string): string | null {
  if (!deadline) return null;
  const datePart = deadline.slice(0, 10);
  if (datePart === todayIso) return 'Due today';
  if (datePart < todayIso) return 'Overdue';
  return `Due ${formatShortDate(datePart)}`;
}