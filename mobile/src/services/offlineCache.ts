import { secureGetItem, secureSetItem, secureDeleteItem, secureMultiDelete } from './secureStorage';

/**
 * Small stale-while-revalidate cache for the read-only screens.
 *
 * Hooks hydrate their state from here first, then refresh from the API in the
 * background, so a cold start (or a slow MongoDB round-trip) still paints real
 * data instead of a full-screen spinner. Writes are fire-and-forget: a failed
 * cache write must never break a screen.
 *
 * expo-secure-store cannot enumerate its keys, so we keep a small index of the
 * cache keys we wrote. The index is what lets logout reliably wipe every
 * cached response (which may contain names, attendance and profile data).
 */

const PREFIX = 'psm_offline_v1:';
const INDEX_KEY = `${PREFIX}__index`;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedValue<T> {
  data: T;
  savedAt: number;
}

const storageKey = (key: string): string => `${PREFIX}${key}`;

let indexQueue: Promise<void> = Promise.resolve();

async function readIndex(): Promise<string[]> {
  const raw = await secureGetItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is string => typeof key === 'string');
  } catch {
    return [];
  }
}

function enqueue(task: () => Promise<void>): void {
  indexQueue = indexQueue.then(task).catch(() => {});
}

export function cacheKey(namespace: string, ...parts: Array<string | null | undefined>): string {
  const suffix = parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(':');
  return suffix ? `${namespace}:${suffix}` : namespace;
}

export async function readCache<T>(
  key: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<CachedValue<T> | null> {
  try {
    const raw = await secureGetItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedValue<T>> | null;
    if (!parsed || typeof parsed.savedAt !== 'number' || !('data' in parsed)) {
      return null;
    }
    if (Date.now() - parsed.savedAt > maxAgeMs) {
      return null;
    }
    return { data: parsed.data as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    const target = storageKey(key);
    const payload: CachedValue<T> = { data, savedAt: Date.now() };
    enqueue(async () => {
      await secureSetItem(target, JSON.stringify(payload));
      const keys = await readIndex();
      if (!keys.includes(target)) {
        await secureSetItem(INDEX_KEY, JSON.stringify([...keys, target]));
      }
    });
  } catch {
    // Storage is a best-effort optimisation; the API remains authoritative.
  }
}

export function removeCache(key: string): void {
  const target = storageKey(key);
  enqueue(async () => {
    await secureDeleteItem(target);
    const keys = await readIndex();
    if (keys.includes(target)) {
      await secureSetItem(INDEX_KEY, JSON.stringify(keys.filter(k => k !== target)));
    }
  });
}

/** Clears every cached response; called when a session ends. */
export function clearOfflineCache(): void {
  enqueue(async () => {
    const keys = await readIndex();
    const targets = keys.filter(key => key.startsWith(PREFIX) && key !== INDEX_KEY);
    if (targets.length > 0) {
      await secureMultiDelete(targets);
    }
    await secureDeleteItem(INDEX_KEY);
  });
}
