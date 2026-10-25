import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '../services/api';
import { readCache, writeCache } from '../services/offlineCache';
import { useNetworkStatus } from './useNetworkStatus';

const STORY_CACHE_KEY = 'company-story';

interface StoryCache {
  mission: string;
  vision: string;
}

export interface CompanyStory {
  mission: string;
  vision: string;
  loading: boolean;
  reload: () => void;
}

// The company mission/vision is authored by the admin in Settings; this hook
// surfaces it wherever it needs to be shown (e.g. the profile dialog).
export function useCompanyStory(): CompanyStory {
  const [mission, setMission] = useState('');
  const [vision, setVision] = useState('');
  const [loading, setLoading] = useState(true);
  const activeRef = useRef(true);
  const { registerReconnect } = useNetworkStatus();

  const load = useCallback(async () => {
    try {
      const res = await getSettings();
      if (!activeRef.current) return;
      const data = res.data || {};
      const nextMission = typeof data.mission === 'string' ? data.mission.trim() : '';
      const nextVision = typeof data.vision === 'string' ? data.vision.trim() : '';
      setMission(nextMission);
      setVision(nextVision);
      writeCache<StoryCache>(STORY_CACHE_KEY, { mission: nextMission, vision: nextVision });
    } catch {
      // Silent: callers simply omit the story when it can't be loaded.
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void readCache<StoryCache>(STORY_CACHE_KEY).then(cached => {
      if (!activeRef.current || !cached) return;
      setMission(typeof cached.data.mission === 'string' ? cached.data.mission : '');
      setVision(typeof cached.data.vision === 'string' ? cached.data.vision : '');
      setLoading(false);
    });
    void load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    return registerReconnect(() => {
      void load();
    });
  }, [registerReconnect, load]);

  return { mission, vision, loading, reload: load };
}
