import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_SEARCHES_STORAGE_KEY = 'psm_recent_searches';
const STORAGE_KEY = RECENT_SEARCHES_STORAGE_KEY;
const MAX_RECENTS = 5;

export interface RecentSearchesData {
  /** Terms that previously returned results. Never contains sensitive data. */
  recents: string[];
  add: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
}

/**
 * Recent search terms only, stored through the same AsyncStorage the app
 * already uses for session state. Only terms that returned results are ever
 * written here, and the list is capped at five entries.
 */
export function useRecentSearches(): RecentSearchesData {
  const [recents, setRecents] = useState<string[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (cancelled || !raw) return;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const terms = parsed
              .filter((term): term is string => typeof term === 'string' && term.trim().length >= 2)
              .slice(0, MAX_RECENTS);
            setRecents(terms);
          }
        } catch {
          // A corrupt value simply means no recents.
        }
      })
      .catch(() => {
        // Storage unavailable — recents stay empty.
      })
      .finally(() => {
        hydrated.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: string[]) => {
    setRecents(next);
    if (!hydrated.current) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      // Best effort only.
    });
  }, []);

  const add = useCallback(
    (term: string) => {
      const value = term.trim();
      if (value.length < 2) return;
      const rest = recents.filter(existing => existing.toLowerCase() !== value.toLowerCase());
      persist([value, ...rest].slice(0, MAX_RECENTS));
    },
    [recents, persist]
  );

  const remove = useCallback(
    (term: string) => {
      persist(recents.filter(existing => existing !== term));
    },
    [recents, persist]
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return { recents, add, remove, clear };
}
