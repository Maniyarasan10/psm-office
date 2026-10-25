import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmployeeDocument } from '../types';
import { getDocuments, getDocumentCategories, uploadDocument } from '../services/api';
import { cacheKey, readCache, writeCache } from '../services/offlineCache';
import { apiErrorMessage } from '../utils/apiError';
import { useNetworkStatus } from './useNetworkStatus';

interface DocumentsCache {
  documents: EmployeeDocument[];
  categories: string[];
}

export interface DocumentIdentity {
  _id: string;
  employee_id?: string;
  name?: string;
}

export interface DocumentUploadPayload {
  file: { uri: string; name: string; type: string; size?: number };
  category: string;
}

export interface DocumentUploadResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface DocumentsData {
  myDocuments: EmployeeDocument[];
  companyDocuments: EmployeeDocument[];
  categories: string[];
  filterCategory: string;
  setFilterCategory: (category: string) => void;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  submitting: boolean;
  uploadProgress: number;
  actionError: string | null;
  reload: () => void;
  refresh: () => void;
  silentReload: () => void;
  submit: (payload: DocumentUploadPayload) => Promise<DocumentUploadResult>;
}

export function useDocuments(identity: DocumentIdentity | null): DocumentsData {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestId = useRef(0);
  const actionBusyRef = useRef(false);
  const { isOnline, registerReconnect } = useNetworkStatus();

  const cacheRef = useRef(cacheKey('documents', identity?._id));
  cacheRef.current = cacheKey('documents', identity?._id);

  useEffect(() => {
    let active = true;
    void readCache<DocumentsCache>(cacheRef.current).then(cached => {
      if (!active || !cached) return;
      setDocuments(Array.isArray(cached.data.documents) ? cached.data.documents : []);
      setCategories(Array.isArray(cached.data.categories) ? cached.data.categories : []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [identity?._id]);

  const stripBase64 = (docs: EmployeeDocument[]): EmployeeDocument[] =>
    docs
      .filter(doc => doc && typeof doc._id === 'string')
      .map(doc => ({
        _id: doc._id,
        file_name: doc.file_name,
        category: doc.category ?? '',
        file_type: doc.file_type,
        file_size: doc.file_size,
        linked_person: doc.linked_person,
        uploaded_at: doc.uploaded_at,
      }));

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++requestId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    try {
      const [docsResponse, categoriesResponse] = await Promise.all([
        getDocuments(),
        getDocumentCategories(),
      ]);
      if (id !== requestId.current) return;
      const nextDocuments = stripBase64(Array.isArray(docsResponse.data) ? docsResponse.data : []);
      const nextCategories = Array.isArray(categoriesResponse.data) ? categoriesResponse.data : [];
      setDocuments(nextDocuments);
      setCategories(nextCategories);
      writeCache<DocumentsCache>(cacheRef.current, {
        documents: nextDocuments,
        categories: nextCategories,
      });
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

  const myDocuments = useMemo(() => {
    const ids = new Set(
      [identity?._id, identity?.employee_id, identity?.name].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      )
    );
    return documents.filter(doc => !!doc.linked_person && ids.has(doc.linked_person));
  }, [documents, identity]);

  const companyDocuments = useMemo(() => {
    const shared = documents.filter(doc => !doc.linked_person);
    if (!filterCategory) return shared;
    return shared.filter(doc => doc.category === filterCategory);
  }, [documents, filterCategory]);

  const submit = useCallback(
    async (payload: DocumentUploadPayload): Promise<DocumentUploadResult> => {
      if (actionBusyRef.current) {
        return { ok: false, error: 'Unable to upload your document right now.' };
      }

      actionBusyRef.current = true;
      setSubmitting(true);
      setActionError(null);
      setUploadProgress(0);

      try {
        const formData = new FormData();
        formData.append(
          'file',
          {
            uri: payload.file.uri,
            name: payload.file.name,
            type: payload.file.type,
          } as unknown as Blob
        );
        formData.append('category', payload.category);
        if (identity?._id) {
          formData.append('linked_person', identity._id);
        }

        const response = await uploadDocument(formData, progress => setUploadProgress(progress));
        await run('silent');
        return {
          ok: true,
          message: 'Document submitted successfully.',
        };
      } catch (err) {
        const message = apiErrorMessage('Unable to submit your document. Please try again.', err);
        setActionError(message);
        return { ok: false, error: message };
      } finally {
        actionBusyRef.current = false;
        setSubmitting(false);
      }
    },
    [identity, run]
  );

  return {
    myDocuments,
    companyDocuments,
    categories,
    filterCategory,
    setFilterCategory,
    loading,
    refreshing,
    error,
    submitting,
    uploadProgress,
    actionError,
    reload,
    refresh,
    silentReload,
    submit,
  };
}