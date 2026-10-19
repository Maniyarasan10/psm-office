import { DirectoryPerson, EmployeeDocument, SupportTicket, Task } from '../types';

/** Queries shorter than this never reach an API. */
export const MIN_QUERY_LENGTH = 2;

export const SEARCH_DEBOUNCE_MS = 300;

/** Per-category cap so one source can never flood the result list. */
export const RESULT_LIMIT = 8;

/**
 * Category keys intentionally match the `kind` discriminator of
 * `SearchResult` so grouping and rendering stay exhaustively typed.
 */
export type SearchCategoryKey = 'person' | 'task' | 'document' | 'support';

export type SearchCategoryFilter = SearchCategoryKey | 'all';

export interface SearchCategoryMeta {
  key: SearchCategoryKey;
  label: string;
  icon: string;
}

export const SEARCH_CATEGORIES: readonly SearchCategoryMeta[] = [
  { key: 'person', label: 'People', icon: 'account-outline' },
  { key: 'task', label: 'Tasks', icon: 'clipboard-text-outline' },
  { key: 'document', label: 'Documents', icon: 'file-document-outline' },
  { key: 'support', label: 'Help desk', icon: 'lifebuoy' },
];

/**
 * A single search hit. Every variant wraps the same safe objects the owning
 * module already navigates with, so opening a result never reveals more than
 * the module itself would.
 */
export type SearchResult =
  | { kind: 'person'; person: DirectoryPerson }
  | { kind: 'task'; task: Task }
  | { kind: 'document'; document: EmployeeDocument }
  | { kind: 'support'; ticket: SupportTicket };

export function resultId(result: SearchResult): string {
  switch (result.kind) {
    case 'person':
      return `person-${result.person._id}`;
    case 'task':
      return `task-${result.task._id}`;
    case 'document':
      return `document-${result.document._id}`;
    case 'support':
      return `support-${result.ticket._id}`;
  }
}

export interface SearchGroup extends SearchCategoryMeta {
  results: SearchResult[];
}

/** Buckets results by category in display order. Empty groups are omitted. */
export function groupResults(results: SearchResult[]): SearchGroup[] {
  const buckets = new Map<SearchCategoryKey, SearchResult[]>();
  results.forEach(result => {
    const list = buckets.get(result.kind) ?? [];
    list.push(result);
    buckets.set(result.kind, list);
  });

  const groups: SearchGroup[] = [];
  SEARCH_CATEGORIES.forEach(meta => {
    const items = buckets.get(meta.key);
    if (items && items.length > 0) groups.push({ ...meta, results: items });
  });
  return groups;
}

/**
 * Deterministic, explainable ranking for locally filtered results:
 * 0 exact match, 1 prefix match, 2 substring match. No scoring beyond that.
 */
export function matchRank(query: string, text: string): number {
  const needle = query.trim().toLowerCase();
  const haystack = text.trim().toLowerCase();
  if (!needle || !haystack) return 2;
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  return 2;
}

/** Stable sort by match quality. Items that do not match go last. */
export function byMatchRank<T>(items: T[], query: string, textOf: (item: T) => string): T[] {
  return items
    .map(item => ({ item, text: textOf(item) }))
    .map(entry => ({
      ...entry,
      rank: entry.text.toLowerCase().includes(query.trim().toLowerCase())
        ? matchRank(query, entry.text)
        : 3,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(entry => entry.item);
}
