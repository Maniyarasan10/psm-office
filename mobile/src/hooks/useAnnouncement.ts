import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import {
  getAnnouncementPermission,
  getAnnouncements,
  sendAnnouncement,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Announcement } from '../types';

export interface AnnouncementData {
  announcement: string;
  announcements: Announcement[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  canSend: boolean | null;
  sending: boolean;
  reload: () => void;
  refresh: () => void;
  syncPermission: () => void;
  publish: (content: string) => Promise<{ ok: boolean; message?: string }>;
}

export function useAnnouncement(): AnnouncementData {
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const [announcement, setAnnouncement] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [canSend, setCanSend] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);

  const requestId = useRef(0);

  const run = useCallback(async (mode: 'initial' | 'refresh') => {
    const id = ++requestId.current;
    if (mode === 'refresh') setRefreshing(true);

    const [annRes, permRes] = await Promise.all([
      getAnnouncements().catch(() => null),
      getAnnouncementPermission(personId || undefined, personTypeValue).catch(() => null),
    ]);

    if (id !== requestId.current) return;

    const data = annRes?.data;
    if (data && (typeof data.announcement === 'string' || Array.isArray(data.announcements))) {
      const list = Array.isArray(data.announcements)
        ? data.announcements
        : typeof data.announcement === 'string' && data.announcement
          ? [{ _id: 'legacy', content: data.announcement, created_at: '' }]
          : [];
      setAnnouncements(list);
      setAnnouncement(typeof data.announcement === 'string' ? data.announcement : '');
      setError(false);
    } else {
      setError(true);
    }

    if (permRes?.data && typeof permRes.data.can_send === 'boolean') {
      setCanSend(permRes.data.can_send);
    }

    setLoading(false);
    setRefreshing(false);
  }, [personId, personTypeValue]);

  const reload = useCallback(() => {
    setLoading(true);
    void run('initial');
  }, [run]);

  const refresh = useCallback(() => {
    void run('refresh');
  }, [run]);

  /** Lightweight re-check of send permission (used when the screen refocuses). */
  const syncPermission = useCallback(() => {
    getAnnouncementPermission(personId || undefined, personTypeValue)
      .then(res => {
        if (res.data && typeof res.data.can_send === 'boolean') {
          setCanSend(res.data.can_send);
        }
      })
      .catch(() => {});
  }, [personId, personTypeValue]);

  const publish = useCallback(async (content: string): Promise<{ ok: boolean; message?: string }> => {
    const trimmed = content.trim();
    if (!trimmed) {
      return { ok: false, message: 'Announcement cannot be empty.' };
    }
    setSending(true);
    try {
      const res = await sendAnnouncement(trimmed, personId || undefined, personTypeValue);
      const created = res.data?.announcement;
      if (created && created._id) {
        setAnnouncements(prev => [created, ...prev.filter(item => item._id !== created._id)]);
      }
      setAnnouncement(trimmed);
      return { ok: true };
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      const message =
        axiosErr.response?.data?.error ??
        'Failed to publish. Check your connection and try again.';
      return { ok: false, message };
    } finally {
      setSending(false);
    }
  }, [personId, personTypeValue]);

  useEffect(() => {
    void run('initial');
    return () => {
      requestId.current += 1;
    };
  }, [run]);

  return {
    announcement,
    announcements,
    loading,
    refreshing,
    error,
    canSend,
    sending,
    reload,
    refresh,
    syncPermission,
    publish,
  };
}
