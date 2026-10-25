import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DirectoryPerson, PersonType, Task } from '../types';
import {
  RawPersonRecord,
  getDocuments,
  getEmployees,
  getInterns,
  getMyTasks,
  getSupportRequests,
} from '../services/api';
import { sortPeopleByName, toDirectoryPerson } from '../utils/people';
import { DEFAULT_TASK_FILTERS, applyTaskFilters, currentLocalIso } from '../utils/tasks';
import {
  MIN_QUERY_LENGTH,
  RESULT_LIMIT,
  SEARCH_CATEGORIES,
  SEARCH_DEBOUNCE_MS,
  SearchCategoryFilter,
  SearchCategoryKey,
  SearchResult,
  byMatchRank,
} from '../utils/search';
import { useNetworkStatus } from './useNetworkStatus';

export interface GlobalSearchScope {
  personId: string;
  personType: string;
  /** Mirrors the identity DocumentsScreen uses for its visible-document split. */
  employeeId?: string;
  personName?: string;
}

export interface GlobalSearchData {
  query: string;
  setQuery: (value: string) => void;
  /** Debounced, trimmed query that actually executed. */
  appliedQuery: string;
  category: SearchCategoryFilter;
  setCategory: (value: SearchCategoryFilter) => void;
  results: SearchResult[];
  loading: boolean;
  /** Sources that failed during the most recent run. */
  failed: SearchCategoryKey[];
  /** Sources queried during the most recent run. */
  queried: SearchCategoryKey[];
  /** True once the query is long enough to execute. */
  ready: boolean;
  /** Re-runs the last executed query immediately (submit, retry). */
  run: () => void;
}

/**
 * Unified search across the smallest set of existing, user-scoped endpoints:
 * people (server-side search), my tasks (local match over my assigned tasks),
 * documents (server-side search plus the same visibility split the Documents
 * module applies) and my help-desk requests (server-side search). Sources
 * fail independently so one broken endpoint never blanks the screen.
 */
export function useGlobalSearch(scope: GlobalSearchScope | null): GlobalSearchData {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [category, setCategory] = useState<SearchCategoryFilter>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<SearchCategoryKey[]>([]);
  const [queried, setQueried] = useState<SearchCategoryKey[]>([]);

  const requestId = useRef(0);
  const tasksCache = useRef<Task[] | null>(null);
  const lastRun = useRef<{ query: string; category: SearchCategoryFilter } | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const todayRef = useRef(currentLocalIso());
  const { isOnline, registerReconnect } = useNetworkStatus();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setAppliedQuery('');
      return;
    }
    const timeout = setTimeout(() => setAppliedQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    return () => {
      requestId.current += 1;
    };
  }, []);

  const execute = useCallback(async (q: string, activeCategory: SearchCategoryFilter) => {
    const currentScope = scopeRef.current;
    if (!currentScope || q.length < MIN_QUERY_LENGTH) return;

    const id = ++requestId.current;
    lastRun.current = { query: q, category: activeCategory };

    const wanted: SearchCategoryKey[] =
      activeCategory === 'all' ? SEARCH_CATEGORIES.map(meta => meta.key) : [activeCategory];

    setQueried(wanted);
    setFailed([]);
    setLoading(true);

    const runners: Record<SearchCategoryKey, () => Promise<SearchResult[]>> = {
      person: async () => {
        const [employeesResponse, internsResponse] = await Promise.all([
          getEmployees(q),
          getInterns(q),
        ]);
        const map = (rows: RawPersonRecord[] | undefined, personType: PersonType): DirectoryPerson[] =>
          (Array.isArray(rows) ? rows : [])
            .filter(
              (row): row is RawPersonRecord =>
                !!row && typeof row._id === 'string' && !!row.name
            )
            .map(row => toDirectoryPerson(row, personType));

        const people = [
          ...map(employeesResponse.data, 'employee'),
          ...map(internsResponse.data, 'intern'),
        ];
        return sortPeopleByName(people)
          .slice(0, RESULT_LIMIT)
          .map(person => ({ kind: 'person' as const, person }));
      },
      task: async () => {
        if (!tasksCache.current) {
          const response = await getMyTasks(currentScope.personId, currentScope.personType);
          tasksCache.current = Array.isArray(response.data) ? response.data : [];
        }
        const matched = applyTaskFilters(
          tasksCache.current,
          DEFAULT_TASK_FILTERS,
          q,
          todayRef.current
        );
        return byMatchRank(matched, q, task => task.title)
          .slice(0, RESULT_LIMIT)
          .map(task => ({ kind: 'task' as const, task }));
      },
      document: async () => {
        const response = await getDocuments(q);
        const docs = Array.isArray(response.data) ? response.data : [];
        const identityIds = new Set(
          [currentScope.personId, currentScope.employeeId, currentScope.personName].filter(
            (value): value is string => typeof value === 'string' && value.length > 0
          )
        );
        const visible = docs.filter(doc => !doc.linked_person || identityIds.has(doc.linked_person));
        return byMatchRank(visible, q, doc => doc.file_name)
          .slice(0, RESULT_LIMIT)
          .map(document => ({ kind: 'document' as const, document }));
      },
      support: async () => {
        const response = await getSupportRequests({
          personId: currentScope.personId,
          personType: currentScope.personType,
          search: q,
          limit: RESULT_LIMIT,
        });
        const tickets = Array.isArray(response.data?.requests) ? response.data.requests : [];
        return tickets
          .slice(0, RESULT_LIMIT)
          .map(ticket => ({ kind: 'support' as const, ticket }));
      },
    };

    const settled = await Promise.allSettled(wanted.map(key => runners[key]()));
    if (id !== requestId.current) return;

    const buckets = new Map<SearchCategoryKey, SearchResult[]>();
    const failedKeys: SearchCategoryKey[] = [];
    settled.forEach((outcome, index) => {
      const key = wanted[index];
      if (outcome.status === 'fulfilled') buckets.set(key, outcome.value);
      else if (!isOnline) {
        // offline: don't count as failed, keep prior results
      } else {
        failedKeys.push(key);
      }
    });

    const flat: SearchResult[] = [];
    SEARCH_CATEGORIES.forEach(meta => {
      const items = buckets.get(meta.key);
      if (items) items.forEach(item => flat.push(item));
    });

    setResults(flat);
    setFailed(failedKeys);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!appliedQuery) {
      requestId.current += 1;
      setResults([]);
      setFailed([]);
      setQueried([]);
      setLoading(false);
      return;
    }
    void execute(appliedQuery, category);
  }, [appliedQuery, category, execute]);

  const run = useCallback(() => {
    const last = lastRun.current;
    const trimmed = query.trim();
    if (last && trimmed === last.query && trimmed.length >= MIN_QUERY_LENGTH) {
      void execute(trimmed, category);
      return;
    }
    if (trimmed.length >= MIN_QUERY_LENGTH) {
      setAppliedQuery(trimmed);
      void execute(trimmed, category);
    }
  }, [query, category, execute]);

  const ready = appliedQuery.length >= MIN_QUERY_LENGTH || loading;

  // Re-run the last search when the connection returns so results stay fresh.
  useEffect(() => {
    return registerReconnect(() => {
      void run();
    });
  }, [registerReconnect, run]);

  return useMemo(
    () => ({
      query,
      setQuery,
      appliedQuery,
      category,
      setCategory,
      results,
      loading,
      failed,
      queried,
      ready,
      run,
    }),
    [query, appliedQuery, category, results, loading, failed, queried, ready, run]
  );
}
