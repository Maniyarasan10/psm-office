import { useCallback, useEffect, useRef, useState } from 'react';
import { AttendanceRecord, Task } from '../types';
import { getMyTasks, getPersonAttendance } from '../services/api';
import { cacheKey, readCache, writeCache } from '../services/offlineCache';

/** Covers the current month plus generous history for context sections. */
const ATTENDANCE_LIMIT = 90;

interface WorkSummaryCache {
  tasks: Task[];
  records: AttendanceRecord[];
}

export interface WorkSummaryScope {
  personId: string;
  personType: string;
}

export interface WorkSummaryData {
  tasks: Task[];
  records: AttendanceRecord[];
  loading: boolean;
  refreshing: boolean;
  tasksError: boolean;
  attendanceError: boolean;
  reload: () => void;
  refresh: () => void;
  silentReload: () => void;
}

/**
 * Loads everything the personal work summary shows: the tasks assigned to the
 * signed-in person and their recent attendance records. The two sources fail
 * independently so one broken endpoint never blanks the whole screen.
 */
export function useWorkSummary(scope: WorkSummaryScope | null): WorkSummaryData {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasksError, setTasksError] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);

  const requestId = useRef(0);
  const scopeRef = useRef<WorkSummaryScope | null>(scope);
  scopeRef.current = scope;

  const cache = cacheKey('work-summary', scope?.personType, scope?.personId);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    void readCache<WorkSummaryCache>(cache).then(cached => {
      if (!active || !cached) return;
      setTasks(Array.isArray(cached.data.tasks) ? cached.data.tasks : []);
      setRecords(Array.isArray(cached.data.records) ? cached.data.records : []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [cache]);

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const currentScope = scopeRef.current;
    if (!currentScope) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const id = ++requestId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    const [tasksResult, attendanceResult] = await Promise.allSettled([
      getMyTasks(currentScope.personId, currentScope.personType),
      getPersonAttendance(currentScope.personId, ATTENDANCE_LIMIT),
    ]);

    if (id !== requestId.current) return;

    if (tasksResult.status === 'fulfilled') {
      setTasks(tasksResult.value.data ?? []);
      setTasksError(false);
    } else {
      setTasksError(true);
    }

    if (attendanceResult.status === 'fulfilled') {
      setRecords(Array.isArray(attendanceResult.value.data) ? attendanceResult.value.data : []);
      setAttendanceError(false);
    } else {
      setAttendanceError(true);
    }

    if (tasksResult.status === 'fulfilled' && attendanceResult.status === 'fulfilled') {
      writeCache<WorkSummaryCache>(
        cacheKey('work-summary', currentScope.personType, currentScope.personId),
        {
          tasks: tasksResult.value.data ?? [],
          records: Array.isArray(attendanceResult.value.data) ? attendanceResult.value.data : [],
        }
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  const reload = useCallback(() => {
    void run('initial');
  }, [run]);

  const refresh = useCallback(() => {
    void run('refresh');
  }, [run]);

  const silentReload = useCallback(() => {
    void run('silent');
  }, [run]);

  useEffect(() => {
    void run('initial');
    return () => {
      requestId.current += 1;
    };
  }, [run]);

  return {
    tasks,
    records,
    loading,
    refreshing,
    tasksError,
    attendanceError,
    reload,
    refresh,
    silentReload,
  };
}
