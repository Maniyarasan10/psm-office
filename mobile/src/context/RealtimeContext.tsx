import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { useAuth } from './AuthContext';
import { realtimeClient, RealtimeEvent, RealtimeEventType } from '../services/realtime';

interface RealtimeContextValue {
  subscribe: (type: RealtimeEventType['type'] | RealtimeEventType, listener: (event: RealtimeEvent) => void) => () => void;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { employee, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }
    void realtimeClient.start();
    return () => {
      realtimeClient.stop();
    };
  }, [employee, loading]);

  const subscribe = useCallback(
    (type: RealtimeEventType['type'] | RealtimeEventType, listener: (event: RealtimeEvent) => void) =>
      realtimeClient.subscribe(type as any, listener as any),
    []
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({ subscribe, connected: realtimeClient.connected }),
    [subscribe]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}
