import { useCallback, useEffect, useRef, useState } from 'react';
import { AttendanceRecord, LeaveRequest } from '../types';
import { getPersonAttendance, getMyLeaveRequests, submitLeaveRequest } from '../services/api';
import { LeaveType } from '../utils/leave';
import { cacheKey, readCache, writeCache } from '../services/offlineCache';
import { useNetworkStatus } from './useNetworkStatus';

const ABSENCE_LIMIT = 30;

interface LeaveCache {
  absenceDays: AttendanceRecord[];
  requests: LeaveRequest[];
}

export interface LeaveScope {
  personId: string;
  personType: string;
}

export interface LeaveSubmitPayload {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface LeaveSubmitResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface LeaveData {
  absenceDays: AttendanceRecord[];
  requests: LeaveRequest[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  submitting: boolean;
  actionError: string | null;
  reload: () => void;
  refresh: () => void;
  silentReload: () => void;
  submit: (payload: LeaveSubmitPayload) => Promise<LeaveSubmitResult>;
}

export function useLeave(scope: LeaveScope | null): LeaveData {
  const [absenceDays, setAbsenceDays] = useState<AttendanceRecord[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestId = useRef(0);
  const actionBusyRef = useRef(false);
  const scopeRef = useRef<LeaveScope | null>(scope);
  scopeRef.current = scope;
  const { isOnline, registerReconnect } = useNetworkStatus();

  const cache = cacheKey('leave', scope?.personType, scope?.personId);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    void readCache<LeaveCache>(cache).then(cached => {
      if (!active || !cached) return;
      setAbsenceDays(Array.isArray(cached.data.absenceDays) ? cached.data.absenceDays : []);
      setRequests(Array.isArray(cached.data.requests) ? cached.data.requests : []);
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

    try {
      const [attendanceResponse, requestsResponse] = await Promise.all([
        getPersonAttendance(currentScope.personId, ABSENCE_LIMIT),
        getMyLeaveRequests(currentScope.personId, currentScope.personType),
      ]);
      if (id !== requestId.current) return;

      const records = Array.isArray(attendanceResponse.data) ? attendanceResponse.data : [];
      const absent = records
        .filter(record => record.status === 'Absent')
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setAbsenceDays(absent);

      const list = Array.isArray(requestsResponse.data?.requests)
        ? requestsResponse.data.requests
        : [];
      setRequests(list);
      writeCache<LeaveCache>(
        cacheKey('leave', currentScope.personType, currentScope.personId),
        { absenceDays: absent, requests: list }
      );
      setError(false);
    } catch {
      if (id !== requestId.current) return;
      if (!isOnline) {
        setError(false);
      } else {
        setError(true);
      }
    } finally {
      if (id === requestId.current) {
        setActionError(null);
        setLoading(false);
        setRefreshing(false);
      }
    }
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

  const submit = useCallback(
    async (payload: LeaveSubmitPayload): Promise<LeaveSubmitResult> => {
      const currentScope = scopeRef.current;
      if (!currentScope || actionBusyRef.current) {
        return { ok: false, error: 'Unable to submit your leave request right now.' };
      }

      actionBusyRef.current = true;
      setSubmitting(true);
      setActionError(null);

      try {
        const response = await submitLeaveRequest(
          payload.leaveType,
          payload.startDate,
          payload.endDate,
          currentScope.personId,
          currentScope.personType,
          payload.reason
        );
        await run('silent');
        const data = response.data ?? {};
        return {
          ok: true,
          message:
            typeof data.message === 'string'
              ? data.message
              : 'Leave request submitted for approval.',
        };
      } catch {
        setActionError('Unable to submit your leave request. Please check your connection and try again.');
        return { ok: false, error: 'Unable to submit your leave request. Please try again.' };
      } finally {
        actionBusyRef.current = false;
        setSubmitting(false);
      }
    },
    [run]
  );

  return {
    absenceDays,
    requests,
    loading,
    refreshing,
    error,
    submitting,
    actionError,
    reload,
    refresh,
    silentReload,
    submit,
  };
}
