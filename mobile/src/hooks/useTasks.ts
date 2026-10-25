import { useCallback, useEffect, useRef, useState } from 'react';
import { Task, TaskStatus } from '../types';
import { addTaskComment, getMyTasks, updateTaskStatus } from '../services/api';
import { cacheKey, readCache, writeCache } from '../services/offlineCache';
import { useNetworkStatus } from './useNetworkStatus';

export interface TasksScope {
  personId: string;
  personType: string;
  authorName?: string;
}

export interface TasksData {
  tasks: Task[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  submitting: boolean;
  actionError: string | null;
  sendingComment: boolean;
  commentError: string | null;
  reload: () => void;
  refresh: () => void;
  silentReload: () => void;
  updateStatus: (taskId: string, nextStatus: TaskStatus) => Promise<boolean>;
  addComment: (taskId: string, body: string) => Promise<boolean>;
  clearCommentError: () => void;
}

/**
 * Loads the tasks assigned to the signed-in person and owns status updates.
 * The server stays authoritative: every write is followed by a refetch.
 */
export function useTasks(scope: TasksScope | null): TasksData {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const requestId = useRef(0);
  const actionBusyRef = useRef(false);
  const scopeRef = useRef<TasksScope | null>(scope);
  scopeRef.current = scope;
  const { isOnline, registerReconnect } = useNetworkStatus();

  const cache = cacheKey('tasks', scope?.personType, scope?.personId);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    void readCache<Task[]>(cache).then(cached => {
      if (!active || !cached || !Array.isArray(cached.data)) return;
      setTasks(cached.data);
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
      const res = await getMyTasks(currentScope.personId, currentScope.personType);
      if (id !== requestId.current) return;
      const nextTasks = res.data ?? [];
      setTasks(nextTasks);
      writeCache(cacheKey('tasks', currentScope.personType, currentScope.personId), nextTasks);
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

  const updateStatus = useCallback(
    async (taskId: string, nextStatus: TaskStatus): Promise<boolean> => {
      if (actionBusyRef.current) return false;

      actionBusyRef.current = true;
      setSubmitting(true);
      setActionError(null);

      try {
        await updateTaskStatus(taskId, nextStatus);
        setTasks(prev =>
          prev.map(task => (task._id === taskId ? { ...task, status: nextStatus } : task))
        );
        await run('silent');
        return true;
      } catch {
        setActionError('Unable to update the task. Please try again.');
        return false;
      } finally {
        actionBusyRef.current = false;
        setSubmitting(false);
      }
    },
    [run]
  );

  const addComment = useCallback(
    async (taskId: string, body: string): Promise<boolean> => {
      const currentScope = scopeRef.current;
      const trimmed = body.trim();
      if (!currentScope || !trimmed) return false;

      setSendingComment(true);
      setCommentError(null);

      try {
        const res = await addTaskComment(taskId, {
          body: trimmed,
          author: currentScope.authorName || 'Unknown',
          author_type: currentScope.personType,
        });
        const updatedTask = res.data?.task;
        if (updatedTask) {
          setTasks(prev =>
            prev.map(task => (task._id === taskId ? { ...task, comments: updatedTask.comments ?? [] } : task))
          );
        }
        void run('silent');
        return true;
      } catch {
        setCommentError('Unable to send the message. Please try again.');
        return false;
      } finally {
        setSendingComment(false);
      }
    },
    [run]
  );

  const clearCommentError = useCallback(() => {
    setCommentError(null);
  }, []);

  return {
    tasks,
    loading,
    refreshing,
    error,
    submitting,
    actionError,
    sendingComment,
    commentError,
    reload,
    refresh,
    silentReload,
    updateStatus,
    addComment,
    clearCommentError,
  };
}
