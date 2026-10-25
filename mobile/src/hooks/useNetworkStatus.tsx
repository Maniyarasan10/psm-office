import { AppState, AppStateStatus } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ENV from '../config/env';

/**
 * Network status + automatic reconnect recovery.
 *
 * React Native does not bundle NetInfo by default, so instead of adding a
 * native dependency we probe the backend's public /api/health endpoint
 * whenever the app comes to the foreground. A registry of reconnect callbacks
 * lets every data hook re-fetch automatically the moment the connection
 * returns — so low-network areas never leave pages stuck on "unable to
 * connect".
 */

const HEALTH_URL = `${ENV.API_BASE_URL.replace(/\/api$/, '')}/api/health`;
const PROBE_TIMEOUT_MS = 5000;

let isOnline = true;
const reconnectCallbacks = new Set<() => void>();

const NetworkStatusContext = createContext<{
  isOnline: boolean;
  registerReconnect: (cb: () => void) => () => void;
} | null>(null);

/** Register a callback (usually a screen's refresh) to run on reconnect. */
export function registerReconnect(cb: () => void): () => void {
  reconnectCallbacks.add(cb);
  return () => reconnectCallbacks.delete(cb);
}

/** Read latest known online state without subscribing. */
export function getIsOnline(): boolean {
  return isOnline;
}

async function probeOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function notifyReconnect() {
  const cbs = Array.from(reconnectCallbacks);
  for (const cb of cbs) {
    try {
      cb();
    } catch {
      // One screen's refresh must never break another.
    }
  }
}

interface NetworkProviderProps {
  children: React.ReactNode;
}

export function NetworkProvider({ children }: NetworkProviderProps) {
  const [online, setOnline] = useState(isOnline);
  const check = useCallback(async () => {
    const ok = await probeOnline();
    const wasOffline = !isOnline;
    isOnline = ok;
    setOnline(ok);
    if (ok && wasOffline) {
      notifyReconnect();
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void check();
      }
    });
    void check();
    return () => subscription.remove();
  }, [check]);

  const value = {
    isOnline: online,
    registerReconnect,
  };

  return (
    <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus() {
  const ctx = useContext(NetworkStatusContext);
  if (!ctx) {
    return { isOnline: isOnline, registerReconnect };
  }
  return ctx;
}
