import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BirthdayEntry, PersonalCalendarItem, Task } from '../types';
import {
  getMyTasks,
  getPersonAttendance,
  getUpcomingBirthdays,
  getPersonalCalendar,
} from '../services/api';
import {
  CalendarIndex,
  buildCalendarIndex,
  CALENDAR_BIRTHDAY_WINDOW,
  CALENDAR_LEAVE_WINDOW,
} from '../utils/calendar';
import { todayIso } from '../utils/leave';
import { useNetworkStatus } from './useNetworkStatus';

export interface CalendarScope {
  personId: string;
  personType: string;
}

export type CalendarSourceKey = 'tasks' | 'leave' | 'birthdays' | 'personal';

export const CALENDAR_SOURCE_LABEL: Record<CalendarSourceKey, string> = {
  tasks: 'deadlines',
  leave: 'leave days',
  birthdays: 'birthdays',
  personal: 'personal notes',
};

export interface CalendarData {
  index: CalendarIndex;
  today: string;
  loading: boolean;
  refreshing: boolean;
  /** True when every source failed and nothing has ever loaded. */
  error: boolean;
  /** Sources that failed on the last run while other data still loaded. */
  failedSources: CalendarSourceKey[];
  reload: () => void;
  refresh: () => void;
  /** Re-reads the sources without showing the loading or pull-to-refresh state. */
  silentReload: () => void;
}

const EMPTY_INDEX = buildCalendarIndex({
  tasks: [],
  absenceDates: [],
  birthdays: [],
  personalItems: [],
  today: todayIso(),
});

/**
 * Loads the three backend sources the calendar is built from — assigned
 * tasks, recorded absence days and upcoming birthdays — and derives a read
 * only day index. Each source fails independently so a single outage never
 * blanks the whole screen.
 */
export function useCalendar(scope: CalendarScope | null): CalendarData {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [absenceDates, setAbsenceDates] = useState<string[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [personalItems, setPersonalItems] = useState<PersonalCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [failedSources, setFailedSources] = useState<CalendarSourceKey[]>([]);

  const requestId = useRef(0);
  const anySuccessRef = useRef(false);
  const scopeRef = useRef<CalendarScope | null>(scope);
  scopeRef.current = scope;
  const { isOnline, registerReconnect } = useNetworkStatus();

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

    const [tasksResult, leaveResult, birthdaysResult, personalResult] =
      await Promise.allSettled([
        getMyTasks(currentScope.personId, currentScope.personType),
        getPersonAttendance(currentScope.personId, CALENDAR_LEAVE_WINDOW),
        getUpcomingBirthdays(CALENDAR_BIRTHDAY_WINDOW),
        getPersonalCalendar(currentScope.personId, currentScope.personType),
      ]);

    if (id !== requestId.current) return;

    const failed: CalendarSourceKey[] = [];

    if (tasksResult.status === 'fulfilled') {
      setTasks(Array.isArray(tasksResult.value.data) ? tasksResult.value.data : []);
    } else if (!isOnline) {
      // offline: keep whatever tasks we have, no error screen
    } else {
      failed.push('tasks');
    }

    if (leaveResult.status === 'fulfilled') {
      const records = Array.isArray(leaveResult.value.data) ? leaveResult.value.data : [];
      setAbsenceDates(records.filter(record => record.status === 'Absent').map(record => record.date));
    } else if (!isOnline) {
      // offline: keep cached absence dates
    } else {
      failed.push('leave');
    }

    if (birthdaysResult.status === 'fulfilled') {
      setBirthdays(Array.isArray(birthdaysResult.value.data) ? birthdaysResult.value.data : []);
    } else if (!isOnline) {
      // offline: keep cached birthdays
    } else {
      failed.push('birthdays');
    }

    if (personalResult.status === 'fulfilled') {
      const data = personalResult.value.data;
      setPersonalItems(Array.isArray(data) ? data : []);
    } else if (!isOnline) {
      // offline: keep cached personal items
    } else {
      failed.push('personal');
    }

    if (failed.length < 4) anySuccessRef.current = true;

    setFailedSources(failed);
    setError(failed.length === 3 && !anySuccessRef.current);
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

  useEffect(() => {
    return registerReconnect(() => {
      void run('refresh');
    });
  }, [registerReconnect, run]);

  const today = todayIso();

  const index = useMemo(
    () =>
      buildCalendarIndex({
        tasks,
        absenceDates,
        birthdays,
        personalItems,
        today,
      }),
    [tasks, absenceDates, birthdays, personalItems, today]
  );

  return {
    index: loading ? EMPTY_INDEX : index,
    today,
    loading,
    refreshing,
    error,
    failedSources,
    reload,
    refresh,
    silentReload,
  };
}

export interface CalendarSummaryData {
  birthdays: BirthdayEntry[];
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

/**
 * The single extra call Home needs for its compact calendar row: upcoming
 * birthdays. Leave status and deadlines are already loaded by Home.
 */
export function useCalendarSummary(windowDays: number | null): CalendarSummaryData {
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [loading, setLoading] = useState(windowDays !== null);
  const [error, setError] = useState(false);

  const requestId = useRef(0);

  const { isOnline, registerReconnect } = useNetworkStatus();

  const run = useCallback(
    async (mode: 'initial' | 'silent') => {
      if (windowDays === null) {
        setLoading(false);
        return;
      }

      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);

      try {
        const response = await getUpcomingBirthdays(windowDays);
        if (id !== requestId.current) return;
        setBirthdays(Array.isArray(response.data) ? response.data : []);
        setError(false);
      } catch {
        if (id !== requestId.current) return;
        if (!isOnline) {
          setError(false);
        } else {
          setError(true);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [windowDays, isOnline]
  );

  const refresh = useCallback(() => {
    void run('silent');
  }, [run]);

  useEffect(() => {
    void run('initial');
    return () => {
      requestId.current += 1;
    };
  }, [run]);

  useEffect(() => {
    return registerReconnect(() => {
      void run('silent');
    });
  }, [registerReconnect, run]);

  return { birthdays, loading, error, refresh };
}
