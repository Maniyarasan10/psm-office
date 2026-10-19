import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PersonType, Project, ProjectStatus } from '../types';
import {
  NewProjectTaskInput,
  createProjectTask,
  getProject,
  updateProjectMembers,
  updateProjectStatus,
} from '../services/api';

export interface ProjectViewer {
  personId: string;
  personType: PersonType;
  isAdmin?: boolean;
}

export interface ProjectMemberRef {
  person_id: string;
  person_type: PersonType;
}

export interface ProjectDetailData {
  project: Project | null;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  isLead: boolean;
  canManageMembers: boolean;
  saving: boolean;
  actionError: string | null;
  reload: () => void;
  refresh: () => void;
  clearActionError: () => void;
  saveStatus: (status: ProjectStatus, progress: number) => Promise<boolean>;
  saveMembers: (members: ProjectMemberRef[]) => Promise<boolean>;
  assignTask: (input: NewProjectTaskInput) => Promise<boolean>;
}

/**
 * Loads one project and owns the lead-only writes (status/progress and
 * membership). The server stays authoritative: the token is what actually
 * grants permission, and every successful write is followed by a refetch.
 */
export function useProjectDetail(projectId: string, viewer: ProjectViewer | null): ProjectDetailData {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestId = useRef(0);
  const busyRef = useRef(false);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      try {
        const res = await getProject(projectId);
        if (id !== requestId.current) return;
        setProject(res.data ?? null);
        setError(false);
      } catch {
        if (id !== requestId.current) return;
        setProject(null);
        setError(true);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [projectId]
  );

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

  const isLead = useMemo(() => {
    if (!project || !viewer?.personId) return false;
    return (
      String(project.team_lead_id ?? '') === String(viewer.personId) &&
      (project.team_lead_type ?? 'employee') === viewer.personType
    );
  }, [project, viewer]);

  const canManageMembers = Boolean(viewer?.isAdmin) || isLead;

  const clearActionError = useCallback(() => setActionError(null), []);

  const saveStatus = useCallback(
    async (status: ProjectStatus, progress: number): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setSaving(true);
      setActionError(null);
      try {
        await updateProjectStatus(projectId, status, progress);
        setProject(prev => (prev ? { ...prev, status, progress } : prev));
        await run('silent');
        return true;
      } catch {
        setActionError('Unable to update the project. Please try again.');
        return false;
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
    },
    [projectId, run]
  );

  const saveMembers = useCallback(
    async (members: ProjectMemberRef[]): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setSaving(true);
      setActionError(null);
      try {
        await updateProjectMembers(projectId, members);
        await run('silent');
        return true;
      } catch {
        setActionError('Unable to update the team. Please try again.');
        return false;
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
    },
    [projectId, run]
  );

  const assignTask = useCallback(
    async (input: NewProjectTaskInput): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setSaving(true);
      setActionError(null);
      try {
        await createProjectTask(projectId, input);
        return true;
      } catch {
        setActionError('Unable to assign the task. Please try again.');
        return false;
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
    },
    [projectId]
  );

  return {
    project,
    loading,
    refreshing,
    error,
    isLead,
    canManageMembers,
    saving,
    actionError,
    reload,
    refresh,
    clearActionError,
    saveStatus,
    saveMembers,
    assignTask,
  };
}
