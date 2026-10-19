import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '../services/api';

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

  const load = useCallback(async () => {
    try {
      const res = await getSettings();
      if (!activeRef.current) return;
      const data = res.data || {};
      setMission(typeof data.mission === 'string' ? data.mission.trim() : '');
      setVision(typeof data.vision === 'string' ? data.vision.trim() : '');
    } catch {
      // Silent: callers simply omit the story when it can't be loaded.
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  return { mission, vision, loading, reload: load };
}
