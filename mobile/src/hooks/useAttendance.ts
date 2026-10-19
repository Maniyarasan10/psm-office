import { useCallback, useEffect, useRef, useState } from 'react';
import { AttendanceRecord, AttendanceSummary, Settings } from '../types';
import {
  clockOut,
  confirmAttendance,
  getPersonAttendance,
  getPersonAttendanceSummary,
  getSettings,
} from '../services/api';

const HISTORY_LIMIT = 90;

export interface AttendanceScope {
  personId: string;
  personType: string;
}

export interface AttendanceData {
  todayRecord: AttendanceRecord | null;
  records: AttendanceRecord[];
  summary: AttendanceSummary | null;
  settings: Settings | null;
  loading: boolean;
  refreshing: boolean;
  recordsError: boolean;
  summaryError: boolean;
  settingsError: boolean;
  submitting: boolean;
  actionError: string | null;
  reload: () => void;
  refresh: () => void;
  checkIn: () => Promise<string | null>;
  checkOut: () => Promise<string | null>;
}

export function useAttendance(scope: AttendanceScope | null): AttendanceData {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recordsError, setRecordsError] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestId = useRef(0);
  const actionBusyRef = useRef(false);
  const scopeRef = useRef<AttendanceScope | null>(scope);
  scopeRef.current = scope;

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

    const [recordsResult, summaryResult, settingsResult] = await Promise.allSettled([
      getPersonAttendance(currentScope.personId, HISTORY_LIMIT),
      getPersonAttendanceSummary(currentScope.personId),
      getSettings(),
    ]);

    if (id !== requestId.current) return;

    if (recordsResult.status === 'fulfilled') {
      setRecords(recordsResult.value.data ?? []);
      setRecordsError(false);
    } else {
      setRecordsError(true);
    }

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value.data);
      setSummaryError(false);
    } else {
      setSummaryError(true);
    }

    if (settingsResult.status === 'fulfilled') {
      setSettings(settingsResult.value.data);
      setSettingsError(false);
    } else {
      setSettingsError(true);
    }

    setActionError(null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const reload = useCallback(() => {
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

  const checkIn = useCallback(async (): Promise<string | null> => {
    const currentScope = scopeRef.current;
    if (!currentScope || actionBusyRef.current) return null;

    actionBusyRef.current = true;
    setSubmitting(true);
    setActionError(null);

    try {
      const time = new Date().toTimeString().slice(0, 5);
      const date = new Date().toISOString().split('T')[0];
      const formData = new FormData();
      formData.append('person_id', currentScope.personId);
      formData.append('person_type', currentScope.personType);
      formData.append('time', time);
      formData.append('date', date);
      await confirmAttendance(formData);
      await run('silent');
      return time;
    } catch {
      setActionError('Unable to check in right now. Please try again.');
      return null;
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [run]);

  const checkOut = useCallback(async (): Promise<string | null> => {
    const currentScope = scopeRef.current;
    if (!currentScope || actionBusyRef.current) return null;

    actionBusyRef.current = true;
    setSubmitting(true);
    setActionError(null);

    try {
      const time = new Date().toTimeString().slice(0, 5);
      const date = new Date().toISOString().split('T')[0];
      await clockOut({
        person_type: currentScope.personType,
        person_id: currentScope.personId,
        date,
        time,
      });
      await run('silent');
      return time;
    } catch {
      setActionError('Unable to check out right now. Please try again.');
      return null;
    } finally {
      actionBusyRef.current = false;
      setSubmitting(false);
    }
  }, [run]);

  const todayIso = new Date().toISOString().split('T')[0];
  const todayRecord = records.find(record => record.date === todayIso) ?? null;

  return {
    todayRecord,
    records,
    summary,
    settings,
    loading,
    refreshing,
    recordsError,
    summaryError,
    settingsError,
    submitting,
    actionError,
    reload,
    refresh,
    checkIn,
    checkOut,
  };
}
