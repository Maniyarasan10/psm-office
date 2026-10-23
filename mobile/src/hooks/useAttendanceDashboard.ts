import { useCallback, useEffect, useRef, useState } from 'react';
import { AttendanceRecord, AttendanceSummary } from '../types';
import {
  getPersonAttendance,
  getPersonAttendanceSummary,
  getTodayAttendance,
} from '../services/api';
import { cacheKey, readCache, writeCache } from '../services/offlineCache';

const DASHBOARD_HISTORY_LIMIT = 200;

export interface AttendanceDashboardData {
  todayRecord: AttendanceRecord | null;
  records: AttendanceRecord[];
  summary: AttendanceSummary | null;
  officeToday: Record<string, number> | null;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  reload: () => void;
  refresh: () => void;
}

export function useAttendanceDashboard(personId: string): AttendanceDashboardData {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [officeToday, setOfficeToday] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const requestId = useRef(0);
  const personIdRef = useRef(personId);
  personIdRef.current = personId;

  useEffect(() => {
    if (!personId) return;
    let active = true;
    void Promise.all([
      readCache<AttendanceRecord[]>(cacheKey('attendance-records', personId)),
      readCache<AttendanceSummary>(cacheKey('attendance-summary', personId)),
    ]).then(([cachedRecords, cachedSummary]) => {
      if (!active) return;
      if (cachedRecords && Array.isArray(cachedRecords.data)) {
        setRecords(cachedRecords.data);
        setLoading(false);
      }
      if (cachedSummary && cachedSummary.data) {
        setSummary(cachedSummary.data);
      }
    });
    return () => {
      active = false;
    };
  }, [personId]);

  const run = useCallback(async (mode: 'initial' | 'refresh') => {
    const currentPersonId = personIdRef.current;
    if (!currentPersonId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const id = ++requestId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    const today = new Date().toISOString().split('T')[0];

    const [recordsResult, summaryResult, todayResult] = await Promise.allSettled([
      getPersonAttendance(currentPersonId, DASHBOARD_HISTORY_LIMIT),
      getPersonAttendanceSummary(currentPersonId),
      getTodayAttendance(today),
    ]);

    if (id !== requestId.current) return;

    if (recordsResult.status === 'fulfilled') {
      const nextRecords = recordsResult.value.data ?? [];
      setRecords(nextRecords);
      writeCache(cacheKey('attendance-records', currentPersonId), nextRecords);
      setError(false);
    } else {
      setError(true);
    }

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value.data);
      writeCache(cacheKey('attendance-summary', currentPersonId), summaryResult.value.data);
    }

    if (todayResult.status === 'fulfilled') {
      setOfficeToday(todayResult.value.data?.summary ?? {});
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

  const todayIso = new Date().toISOString().split('T')[0];
  const todayRecord = records.find(record => record.date === todayIso) ?? null;

  return {
    todayRecord,
    records,
    summary,
    officeToday,
    loading,
    refreshing,
    error,
    reload,
    refresh,
  };
}
