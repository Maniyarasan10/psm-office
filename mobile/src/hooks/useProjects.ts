import { useCallback, useEffect, useRef, useState } from 'react';
import { Project } from '../types';
import { getProjects } from '../services/api';

export interface ProjectsData {
  projects: Project[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  reload: () => void;
  refresh: () => void;
  silentReload: () => void;
}

/**
 * Loads the company-wide project list shown on the Work tab. Every signed-in
 * person sees the same read-only data; the server stays authoritative.
 */
export function useProjects(): ProjectsData {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const requestId = useRef(0);

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++requestId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    try {
      const res = await getProjects();
      if (id !== requestId.current) return;
      setProjects(Array.isArray(res.data) ? res.data : []);
      setError(false);
    } catch {
      if (id !== requestId.current) return;
      setError(true);
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

  return { projects, loading, refreshing, error, reload, refresh, silentReload };
}
