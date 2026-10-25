import { useCallback, useEffect, useRef, useState } from 'react';
import { SupportStatus, SupportStatusStats, SupportTicket } from '../types';
import { getSupportCategories, getSupportRequests } from '../services/api';
import { SUPPORT_PAGE_SIZE } from '../utils/support';
import { useNetworkStatus } from './useNetworkStatus';

export interface SupportScope {
  personId: string;
  personType: string;
  authorName?: string;
}

export interface SupportData {
  requests: SupportTicket[];
  total: number;
  stats: SupportStatusStats | undefined;
  categories: string[];
  status: SupportStatus | '';
  category: string;
  search: string;
  setStatus: (status: SupportStatus | '') => void;
  setCategory: (category: string) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: boolean;
  hasMore: boolean;
  reload: () => void;
  refresh: () => void;
  silentReload: () => void;
  loadMore: () => void;
}

interface FetchMode {
  mode: 'initial' | 'query' | 'refresh' | 'silent';
}

const EMPTY_STATS: SupportStatusStats = {
  open: 0,
  in_progress: 0,
  waiting: 0,
  resolved: 0,
  rejected: 0,
  cancelled: 0,
  closed: 0,
};

/**
 * Owns the employee support request list: server-side status / category /
 * search filters, pagination and the per-status counts used by the summary
 * strip. Every query change refetches from the backend so counts always match
 * the current filter.
 */
export function useSupport(scope: SupportScope | null): SupportData {
  const [requests, setRequests] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SupportStatusStats | undefined>(undefined);
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<SupportStatus | ''>('');
  const [category, setCategory] = useState('');
  const [search, setSearchState] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const requestId = useRef(0);
  const queryBusyRef = useRef(true);
  const loadMoreBusyRef = useRef(false);
  const categoriesLoadedRef = useRef(false);
  const firstRunRef = useRef(true);
  const { isOnline, registerReconnect } = useNetworkStatus();

  const scopeRef = useRef<SupportScope | null>(scope);
  scopeRef.current = scope;
  const itemsRef = useRef<SupportTicket[]>([]);
  itemsRef.current = requests;
  const hasMoreRef = useRef(false);
  hasMoreRef.current = hasMore;

  const scopeKey = scope ? `${scope.personId}:${scope.personType}` : '';

  useEffect(() => {
    const value = search.trim();
    const timer = setTimeout(() => setAppliedSearch(value), value ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  const run = useCallback(
    async ({ mode }: FetchMode) => {
      const currentScope = scopeRef.current;
      if (!currentScope) {
        queryBusyRef.current = false;
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const id = ++requestId.current;
      queryBusyRef.current = true;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      try {
        const request = getSupportRequests({
          personId: currentScope.personId,
          personType: currentScope.personType,
          status: status || undefined,
          category: category || undefined,
          search: appliedSearch || undefined,
          limit: SUPPORT_PAGE_SIZE,
          skip: 0,
        });

        const response = categoriesLoadedRef.current
          ? Promise.resolve(null)
          : getSupportCategories();

        const [listResponse, categoriesResponse] = await Promise.all([request, response]);
        if (id !== requestId.current) return;

        const page = listResponse.data;
        const incoming = Array.isArray(page?.requests) ? page.requests : [];
        setRequests(incoming);
        setTotal(typeof page?.total === 'number' ? page.total : incoming.length);
        setStats(page?.stats ? { ...EMPTY_STATS, ...page.stats } : EMPTY_STATS);
        setHasMore(incoming.length >= SUPPORT_PAGE_SIZE && incoming.length < (page?.total ?? 0));

        if (categoriesResponse) {
          setCategories(Array.isArray(categoriesResponse.data) ? categoriesResponse.data : []);
          categoriesLoadedRef.current = true;
        }
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
          queryBusyRef.current = false;
          setLoading(false);
        }
        // Cleared unconditionally so a superseded refresh can't leave the
        // pull-to-refresh spinner stuck.
        setRefreshing(false);
      }
    },
    [status, category, appliedSearch, scopeKey]
  );

  const reload = useCallback(() => {
    void run({ mode: 'initial' });
  }, [run]);

  const refresh = useCallback(() => {
    void run({ mode: 'refresh' });
  }, [run]);

  const silentReload = useCallback(() => {
    void run({ mode: 'silent' });
  }, [run]);

  useEffect(() => {
    void run({ mode: firstRunRef.current ? 'initial' : 'query' });
    firstRunRef.current = false;
    return () => {
      requestId.current += 1;
    };
  }, [run]);

  useEffect(() => {
    return registerReconnect(() => {
      void run({ mode: 'refresh' });
    });
  }, [registerReconnect, run]);

  const loadMore = useCallback(() => {
    const currentScope = scopeRef.current;
    if (!currentScope) return;
    if (queryBusyRef.current || loadMoreBusyRef.current || !hasMoreRef.current) return;

    const id = requestId.current;
    const skip = itemsRef.current.length;
    loadMoreBusyRef.current = true;
    setLoadingMore(true);

    void (async () => {
      try {
        const response = await getSupportRequests({
          personId: currentScope.personId,
          personType: currentScope.personType,
          status: status || undefined,
          category: category || undefined,
          search: appliedSearch || undefined,
          limit: SUPPORT_PAGE_SIZE,
          skip,
        });
        if (id !== requestId.current) return;
        const incoming = Array.isArray(response.data?.requests) ? response.data.requests : [];
        setRequests(prev => [...prev, ...incoming]);
        const nextCount = skip + incoming.length;
        const nextTotal = typeof response.data?.total === 'number' ? response.data.total : nextCount;
        setTotal(nextTotal);
        const more = incoming.length > 0 && nextCount < nextTotal;
        setHasMore(more);
        hasMoreRef.current = more;
        setError(false);
      } catch {
        if (id !== requestId.current) return;
        if (!isOnline) {
          setError(false);
        } else {
          setError(true);
        }
      } finally {
        // Always release the guard so a refresh that supersedes pagination
        // can't leave "load more" blocked.
        loadMoreBusyRef.current = false;
        setLoadingMore(false);
      }
    })();
  }, [status, category, appliedSearch, scopeKey]);

  const resetFilters = useCallback(() => {
    setStatus('');
    setCategory('');
    setSearchState('');
    setAppliedSearch('');
  }, []);

  return {
    requests,
    total,
    stats,
    categories,
    status,
    category,
    search,
    setStatus,
    setCategory,
    setSearch: setSearchState,
    resetFilters,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    reload,
    refresh,
    silentReload,
    loadMore,
  };
}

export interface SupportSummaryData {
  total: number;
  stats: SupportStatusStats | undefined;
  loading: boolean;
  error: boolean;
  reload: () => void;
  silentReload: () => void;
}

/**
 * Lightweight home-screen summary: one request with `limit=1` is enough to get
 * the server-side counts for the signed-in person.
 */
export function useSupportSummary(scope: SupportScope | null): SupportSummaryData {
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SupportStatusStats | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const requestId = useRef(0);
  const scopeRef = useRef<SupportScope | null>(scope);
  scopeRef.current = scope;
  const scopeKey = scope ? `${scope.personId}:${scope.personType}` : '';
  const { isOnline, registerReconnect } = useNetworkStatus();

  const run = useCallback(
    async (mode: 'initial' | 'silent') => {
      const currentScope = scopeRef.current;
      if (!currentScope) {
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      try {
        const response = await getSupportRequests({
          personId: currentScope.personId,
          personType: currentScope.personType,
          limit: 1,
        });
        if (id !== requestId.current) return;
        setTotal(typeof response.data?.total === 'number' ? response.data.total : 0);
        setStats(response.data?.stats ? { ...EMPTY_STATS, ...response.data.stats } : EMPTY_STATS);
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
    [scopeKey, isOnline]
  );

  const reload = useCallback(() => {
    void run('initial');
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
      void run('silent');
    });
  }, [registerReconnect, run]);

  return { total, stats, loading, error, reload, silentReload };
}
