import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportPriority, SupportTicket } from '../types';
import {
  addSupportResponse,
  cancelSupportRequest,
  confirmSupportResolution,
  createSupportRequest,
  getSupportCategories,
  getSupportTicket,
  reopenSupportRequest,
} from '../services/api';
import {
  MAX_ATTACHMENTS,
  RESPONSE_MAX_LENGTH,
  SupportFieldErrors,
  SupportFieldKey,
  hasFieldErrors,
  validateNewRequest,
} from '../utils/support';
import { SupportScope } from './useSupport';

export interface SupportDraftFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export interface SupportActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface SupportTicketData {
  ticket: SupportTicket | null;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  forbidden: boolean;
  notFound: boolean;
  responding: boolean;
  actionBusy: boolean;
  responseError: string | null;
  actionError: string | null;
  successMessage: string | null;
  reload: () => void;
  refresh: () => void;
  clearSuccess: () => void;
  sendResponse: (body: string, files: SupportDraftFile[]) => Promise<boolean>;
  cancelRequest: () => Promise<boolean>;
  reopenRequest: () => Promise<boolean>;
  confirmResolution: () => Promise<boolean>;
}

/** Pulls the backend's own error message so the UI never invents one. */
function serverError(fallback: string, error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { error?: unknown } | undefined;
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  }
  return fallback;
}

function isStatus(error: unknown, code: number): boolean {
  return axios.isAxiosError(error) && error.response?.status === code;
}

/**
 * Loads one support request and owns every employee-facing write for it:
 * replies plus the cancel / reopen / confirm-resolution transitions the backend
 * allows. The signed-in person's id is always sent so ownership is enforced
 * server side.
 */
export function useSupportTicket(
  ticketId: string,
  scope: SupportScope | null
): SupportTicketData {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [responding, setResponding] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const requestId = useRef(0);
  const busyRef = useRef(false);
  const scopeRef = useRef<SupportScope | null>(scope);
  scopeRef.current = scope;
  const scopeKey = scope ? `${scope.personId}:${scope.personType}` : '';

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const currentScope = scopeRef.current;
      if (!currentScope || !ticketId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      try {
        const response = await getSupportTicket(ticketId, currentScope.personId);
        if (id !== requestId.current) return;
        setTicket(response.data ?? null);
        setError(false);
        setForbidden(false);
        setNotFound(false);
      } catch (requestError) {
        if (id !== requestId.current) return;
        // Keep an already-loaded ticket on a failed refresh so the screen can
        // keep showing it; only drop it when the server says it is gone.
        const gone = isStatus(requestError, 404) || isStatus(requestError, 403);
        if (gone) setTicket(null);
        setNotFound(isStatus(requestError, 404));
        setForbidden(isStatus(requestError, 403));
        setError(true);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    [ticketId, scopeKey]
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

  const sendResponse = useCallback(
    async (body: string, files: SupportDraftFile[]): Promise<boolean> => {
      const currentScope = scopeRef.current;
      if (!currentScope || busyRef.current) return false;

      const trimmed = body.trim();
      if (!trimmed && files.length === 0) {
        setResponseError('Write a message or attach a file before sending.');
        return false;
      }
      if (trimmed.length > RESPONSE_MAX_LENGTH) {
        setResponseError(
          `Keep your message under ${RESPONSE_MAX_LENGTH.toLocaleString()} characters.`
        );
        return false;
      }

      busyRef.current = true;
      setResponding(true);
      setResponseError(null);
      setSuccessMessage(null);

      try {
        const formData = new FormData();
        formData.append('author_type', 'employee');
        formData.append('body', trimmed);
        formData.append('person_id', currentScope.personId);
        formData.append('person_type', currentScope.personType);
        if (currentScope.authorName) formData.append('author_name', currentScope.authorName);
        files.forEach(file => {
          formData.append(
            'files',
            { uri: file.uri, name: file.name, type: file.type } as unknown as Blob
          );
        });

        const response = await addSupportResponse(ticketId, formData);
        setTicket(response.data.ticket ?? null);
        setSuccessMessage('Your reply was added to the request.');
        setError(false);
        return true;
      } catch (requestError) {
        setResponseError(serverError('Unable to send your reply. Please try again.', requestError));
        return false;
      } finally {
        busyRef.current = false;
        setResponding(false);
      }
    },
    [ticketId]
  );

  const runAction = useCallback(
    async (
      action: 'cancel' | 'reopen' | 'confirm',
      successMessageText: string
    ): Promise<boolean> => {
      const currentScope = scopeRef.current;
      if (!currentScope || busyRef.current) return false;

      busyRef.current = true;
      setActionBusy(true);
      setActionError(null);
      setSuccessMessage(null);

      try {
        const response =
          action === 'cancel'
            ? await cancelSupportRequest(ticketId, currentScope.personId)
            : action === 'reopen'
              ? await reopenSupportRequest(ticketId, currentScope.personId)
              : await confirmSupportResolution(ticketId, currentScope.personId);
        setTicket(response.data.ticket ?? null);
        setSuccessMessage(successMessageText);
        return true;
      } catch (requestError) {
        setActionError(serverError('Unable to update this request. Please try again.', requestError));
        return false;
      } finally {
        busyRef.current = false;
        setActionBusy(false);
      }
    },
    [ticketId]
  );

  const cancelRequest = useCallback(
    () => runAction('cancel', 'This request has been cancelled.'),
    [runAction]
  );

  const reopenRequest = useCallback(
    () => runAction('reopen', 'This request is open again.'),
    [runAction]
  );

  const confirmResolution = useCallback(
    () => runAction('confirm', 'Thanks — the request is now closed.'),
    [runAction]
  );

  const clearSuccess = useCallback(() => setSuccessMessage(null), []);

  return {
    ticket,
    loading,
    refreshing,
    error,
    forbidden,
    notFound,
    responding,
    actionBusy,
    responseError,
    actionError,
    successMessage,
    reload,
    refresh,
    clearSuccess,
    sendResponse,
    cancelRequest,
    reopenRequest,
    confirmResolution,
  };
}

export interface CreateSupportValues {
  category: string;
  subject: string;
  description: string;
  priority: SupportPriority;
  files: SupportDraftFile[];
}

export interface CreateSupportResult extends SupportActionResult {
  ticketId?: string;
}

export interface CreateSupportData {
  categories: string[];
  categoriesLoading: boolean;
  categoriesError: boolean;
  submitting: boolean;
  uploadProgress: number;
  fieldErrors: SupportFieldErrors;
  actionError: string | null;
  retryCategories: () => void;
  clearFieldError: (field: SupportFieldKey) => void;
  clearFieldErrors: () => void;
  submit: (values: CreateSupportValues) => Promise<CreateSupportResult>;
}

/**
 * Loads the support categories and creates a new request. Client side
 * validation mirrors the backend rules so the user gets instant feedback; the
 * server response stays authoritative.
 */
export function useCreateSupportRequest(scope: SupportScope | null): CreateSupportData {
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<SupportFieldErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const requestId = useRef(0);
  const busyRef = useRef(false);
  const scopeRef = useRef<SupportScope | null>(scope);
  scopeRef.current = scope;
  const scopeKey = scope ? `${scope.personId}:${scope.personType}` : '';

  const loadCategories = useCallback(async () => {
    const id = ++requestId.current;
    setCategoriesLoading(true);
    setCategoriesError(false);
    try {
      const response = await getSupportCategories();
      if (id !== requestId.current) return;
      setCategories(Array.isArray(response.data) ? response.data : []);
    } catch {
      if (id !== requestId.current) return;
      setCategoriesError(true);
    } finally {
      if (id === requestId.current) setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    return () => {
      requestId.current += 1;
    };
  }, [loadCategories]);

  const clearFieldErrors = useCallback(() => setFieldErrors({}), []);

  const clearFieldError = useCallback((field: SupportFieldKey) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next: SupportFieldErrors = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const submit = useCallback(
    async (values: CreateSupportValues): Promise<CreateSupportResult> => {
      const currentScope = scopeRef.current;
      if (!currentScope) {
        return { ok: false, error: 'Your session is unavailable. Please sign in again.' };
      }
      if (busyRef.current) {
        return { ok: false, error: 'Your request is already being submitted.' };
      }

      const errors = validateNewRequest(values);
      setFieldErrors(errors);
      if (hasFieldErrors(errors)) {
        return { ok: false, error: 'Please fix the highlighted fields.' };
      }
      if (values.files.length > MAX_ATTACHMENTS) {
        return { ok: false, error: `You can attach up to ${MAX_ATTACHMENTS} images.` };
      }

      busyRef.current = true;
      setSubmitting(true);
      setUploadProgress(0);
      setActionError(null);

      try {
        const formData = new FormData();
        formData.append('person_id', currentScope.personId);
        formData.append('person_type', currentScope.personType);
        formData.append('category', values.category.trim());
        formData.append('subject', values.subject.trim());
        formData.append('description', values.description.trim());
        formData.append('priority', values.priority);
        values.files.forEach(file => {
          formData.append(
            'files',
            { uri: file.uri, name: file.name, type: file.type } as unknown as Blob
          );
        });

        const response = await createSupportRequest(formData, progress =>
          setUploadProgress(progress)
        );
        return { ok: true, ticketId: response.data.ticket?._id, message: 'Request submitted.' };
      } catch (requestError) {
        const message = serverError(
          'Unable to submit your request. Please check your connection and try again.',
          requestError
        );
        setActionError(message);
        return { ok: false, error: message };
      } finally {
        busyRef.current = false;
        setSubmitting(false);
      }
    },
    []
  );

  return {
    categories,
    categoriesLoading,
    categoriesError,
    submitting,
    uploadProgress,
    fieldErrors,
    actionError,
    retryCategories: loadCategories,
    clearFieldError,
    clearFieldErrors,
    submit,
  };
}
