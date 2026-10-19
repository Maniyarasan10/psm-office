import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import ENV from '../config/env';
import * as notificationService from '../services/notificationService';
import {
  InAppNotification,
  NotificationRoute,
  NOTIFICATION_STORAGE_KEY,
  MAX_STORED_NOTIFICATIONS,
  SERVER_ID_PREFIX,
  ServerNotification,
} from './types';
import { resolveRouteFromData } from '../utils/notifications';

interface NotificationPayload {
  id: string;
  title: string;
  body?: string;
  route?: NotificationRoute | null;
}

interface NotificationsContextValue {
  notifications: InAppNotification[];
  unreadCount: number;
  ready: boolean;
  permissionStatus: notificationService.PushPermissionStatus | null;
  pendingRoute: NotificationRoute | null;
  /** Newest notification to announce via the in-app banner (null when none). */
  latestArrival: InAppNotification | null;
  dismissArrival: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  consumePendingRoute: () => void;
  enableNotifications: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function upsertNotification(
  state: InAppNotification[],
  payload: NotificationPayload,
  read: boolean
): InAppNotification[] {
  const now = Date.now();
  const existing = state.find(n => n.id === payload.id);
  if (existing) {
    if (existing.read === read) return state;
    return state.map(n => (n.id === payload.id ? { ...n, read } : n));
  }
  const next: InAppNotification = {
    id: payload.id,
    title: payload.title,
    body: payload.body,
    receivedAt: now,
    read,
    route: payload.route ?? null,
  };
  return [next, ...state].slice(0, MAX_STORED_NOTIFICATIONS);
}

interface InputNotification {
  identifier: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}

interface StoredInbox {
  ownerId: string;
  items: InAppNotification[];
}

function toPayload(input: InputNotification): NotificationPayload {
  return {
    id: input.identifier,
    title: input.title,
    body: input.body ?? undefined,
    route: resolveRouteFromData(input.data),
  };
}

// Backend timestamps are UTC ISO strings without a timezone suffix (e.g.
// "2026-10-11T08:15:58.970000"). Date.parse would read those as local time, so
// the list showed the wrong time and sorted out of order. Treat them as UTC.
function parseServerTimestamp(value: string): number {
  if (!value) return Date.now();
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

// Server inbox rows store the route as a bare string plus a ref_id (e.g. the
// task id). Rebuild the full deep-link so tapping a row opens the exact record
// instead of just its section.
function routeFromServer(item: ServerNotification): NotificationRoute | null {
  const base = resolveRouteFromData(item.route ? { route: item.route } : null);
  if (!base) return null;
  const ref = item.ref_id ?? undefined;
  if (!ref) return base;
  switch (base.target) {
    case 'tasks':
      return { ...base, taskId: ref };
    case 'support':
      return { ...base, supportId: ref };
    case 'announcements':
      return { ...base, announcementId: ref };
    default:
      return base;
  }
}

function fromServer(item: ServerNotification): InAppNotification {
  return {
    id: `${SERVER_ID_PREFIX}${item._id}`,
    title: item.title,
    body: item.body || undefined,
    receivedAt: parseServerTimestamp(item.created_at),
    read: Boolean(item.read),
    route: routeFromServer(item),
  };
}

// Two entries describe the same event when their title and message match. An
// empty body is treated as the title (the backend pushes `body || title`), so a
// push and its stored inbox copy still collapse onto one another.
function dedupeKeyOf(n: InAppNotification): string {
  return `${n.title}\u0000${n.body || n.title}`;
}

// Collapse entries that describe the same event. The newest timestamp wins and
// a read state from any copy is preserved, so re-syncing never revives a
// read row or shows the same event twice.
function dedupeByIdentity(items: InAppNotification[]): InAppNotification[] {
  const byKey = new Map<string, InAppNotification>();
  for (const item of items) {
    const key = dedupeKeyOf(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const newest = existing.receivedAt >= item.receivedAt ? existing : item;
    const read = existing.read || item.read;
    byKey.set(key, newest.read === read ? newest : { ...newest, read });
  }
  return Array.from(byKey.values());
}

// Server entries are authoritative and win over a matching, locally-received
// push (same title + body) so the same event never shows twice and read state
// stays in sync with the backend.
function mergeServerAndLocal(
  server: InAppNotification[],
  local: InAppNotification[]
): InAppNotification[] {
  const serverKeys = new Set(server.map(dedupeKeyOf));
  const localOnly = local.filter(
    n => !n.id.startsWith(SERVER_ID_PREFIX) && !serverKeys.has(dedupeKeyOf(n))
  );
  const merged = dedupeByIdentity([...server, ...localOnly]);
  merged.sort((a, b) => b.receivedAt - a.receivedAt);
  return merged.slice(0, MAX_STORED_NOTIFICATIONS);
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { employee, personType, loading: authLoading } = useAuth();
  const employeeId = employee?._id;

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [ready, setReady] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<notificationService.PushPermissionStatus | null>(null);
  const [pendingRoute, setPendingRoute] = useState<NotificationRoute | null>(null);
  const [latestArrival, setLatestArrival] = useState<InAppNotification | null>(null);

  // Latest list + hydration flag readable from async callbacks without
  // re-subscribing, used to detect a genuinely new arrival for the banner.
  const notificationsRef = useRef<InAppNotification[]>([]);
  const readyRef = useRef(false);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const dismissArrival = useCallback(() => setLatestArrival(null), []);

  // Merge the persisted server inbox into the list. Best-effort: an offline or
  // unauthenticated request never clears what is already shown.
  const refresh = useCallback(async () => {
    if (!employeeId) return;
    try {
      const items = await notificationService.fetchServerNotifications(employeeId, personType);
      const serverItems = items.map(fromServer);
      const prev = notificationsRef.current;
      const merged = mergeServerAndLocal(serverItems, prev);
      // Surface a banner only for a new, unread row on top of an inbox we had
      // already shown, so the first load never pops a stale notification.
      if (readyRef.current && prev.length > 0) {
        const prevIds = new Set(prev.map(n => n.id));
        const fresh = merged.filter(n => !prevIds.has(n.id) && !n.read);
        if (fresh.length > 0) setLatestArrival(fresh[0]);
      }
      setNotifications(merged);
    } catch {
      // Offline / auth failure: keep the current list untouched.
    }
  }, [employeeId, personType]);

  // The backend nudges this socket whenever it stores a notification for us,
  // so the inbox updates without waiting for a pull/push round-trip.
  const { subscribe } = useRealtime();
  useEffect(() => {
    if (!employeeId) return;
    return subscribe('notification', () => {
      void refresh();
    });
  }, [employeeId, refresh, subscribe]);

  useEffect(() => {
    if (!ENV.ENABLE_PUSH_NOTIFICATIONS || !employeeId) return;
    let disposed = false;

    notificationService.setupNotificationHandler();
    void notificationService.ensureAndroidChannel();

    AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY)
      .then(raw => {
        if (disposed) return;
        let items: InAppNotification[] | null = null;
        if (raw) {
          try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const envelope = parsed as Partial<StoredInbox>;
              if (envelope.ownerId === employeeId && Array.isArray(envelope.items)) {
                items = envelope.items
                  .filter(
                    (n): n is InAppNotification =>
                      !!n && typeof n.id === 'string' && typeof n.title === 'string'
                  )
                  .slice(0, MAX_STORED_NOTIFICATIONS);
              }
            }
          } catch {
            // Ignore malformed inbox and start fresh.
          }
        }
        if (items) {
          setNotifications(items);
        } else {
          // No inbox or one that belongs to another account / an old format:
          // drop it so it can never surface under the wrong user.
          void AsyncStorage.removeItem(NOTIFICATION_STORAGE_KEY).catch(() => {});
        }
        readyRef.current = true;
        setReady(true);
      })
      .catch(() => {
        if (!disposed) {
          readyRef.current = true;
          setReady(true);
        }
      });

    // Android 13+ reports "denied" (not "undetermined") until the first grant,
    // because notifications stay disabled until then. Gate on canAskAgain rather
    // than the status alone so the dialog actually appears on a fresh install;
    // once permanently denied the system shows nothing and the Notifications
    // screen offers Settings instead.
    void (async () => {
      const info = await notificationService.getPushPermissionInfo();
      if (disposed) return;
      let status = info.status;
      if (status !== 'granted' && info.canAskAgain) {
        status = await notificationService.requestPushPermission();
        if (disposed) return;
      }
      setPermissionStatus(status);
      if (status !== 'granted') return;
      const token = await notificationService.getExpoPushToken();
      if (token) {
        void notificationService.registerPushTokenWithBackend(token, employeeId, personType);
      }
    })();

    // Populate from the persisted inbox, and refresh whenever the app returns
    // to the foreground so notifications received while closed still appear.
    void refresh();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });

    const receivedSubscription = notificationService.addNotificationReceivedListener(notification => {
      const content = notification.request.content;
      const payload = toPayload({
        identifier: notification.request.identifier,
        title: content.title ?? 'Notification',
        body: content.body,
        data: content.data,
      });
      setNotifications(prev => upsertNotification(prev, payload, false));
      // Foreground push: surface the in-app banner right away.
      setLatestArrival({
        id: payload.id,
        title: payload.title,
        body: payload.body,
        receivedAt: Date.now(),
        read: false,
        route: payload.route ?? null,
      });
    });

    const responseSubscription = notificationService.addNotificationResponseListener(response => {
      const content = response.notification.request.content;
      setNotifications(prev =>
        upsertNotification(
          prev,
          toPayload({
            identifier: response.notification.request.identifier,
            title: content.title ?? 'Notification',
            body: content.body,
            data: content.data,
          }),
          true
        )
      );
      const route = resolveRouteFromData(content.data);
      if (route) setPendingRoute(route);
    });

    void notificationService.getLastNotificationResponse().then(response => {
      if (disposed || !response) return;
      const content = response.notification.request.content;
      setNotifications(prev =>
        upsertNotification(
          prev,
          toPayload({
            identifier: response.notification.request.identifier,
            title: content.title ?? 'Notification',
            body: content.body,
            data: content.data,
          }),
          true
        )
      );
      const route = resolveRouteFromData(content.data);
      if (route) setPendingRoute(route);
    });

    return () => {
      disposed = true;
      appStateSubscription.remove();
      notificationService.removeNotificationSubscription(receivedSubscription);
      notificationService.removeNotificationSubscription(responseSubscription);
    };
  }, [employeeId, personType, refresh]);

  // Persist only while signed in, and stamp the inbox with its owner so a
  // later account can never hydrate another person's notifications.
  useEffect(() => {
    if (!ready || !employeeId) return;
    const envelope: StoredInbox = { ownerId: employeeId, items: notifications };
    void AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(envelope)).catch(() => {});
  }, [notifications, ready, employeeId]);

  // Logout (or a failed session restore): wipe the in-memory inbox, the
  // persisted copy, and any pending deep link from the previous session.
  useEffect(() => {
    if (authLoading || employeeId) return;
    readyRef.current = false;
    setNotifications([]);
    setReady(false);
    setPendingRoute(null);
    setLatestArrival(null);
    void AsyncStorage.removeItem(NOTIFICATION_STORAGE_KEY).catch(() => {});
  }, [authLoading, employeeId]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => {
      const target = prev.find(n => n.id === id);
      if (!target || target.read) return prev;
      return prev.map(n => (n.id === id ? { ...n, read: true } : n));
    });
    if (id.startsWith(SERVER_ID_PREFIX) && employeeId) {
      void notificationService
        .markServerRead(id.slice(SERVER_ID_PREFIX.length), employeeId, personType)
        .catch(() => {});
    }
  }, [employeeId, personType]);

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      if (prev.every(n => n.read)) return prev;
      return prev.map(n => (n.read ? n : { ...n, read: true }));
    });
    if (employeeId) {
      void notificationService.markServerAllRead(employeeId, personType).catch(() => {});
    }
  }, [employeeId, personType]);

  // Remove one entry from the inbox. Server-backed rows are also deleted on the
  // backend so the next refresh cannot bring them back.
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (id.startsWith(SERVER_ID_PREFIX) && employeeId) {
      void notificationService
        .deleteServerNotification(id.slice(SERVER_ID_PREFIX.length), employeeId, personType)
        .catch(() => {});
    }
  }, [employeeId, personType]);

  const consumePendingRoute = useCallback(() => {
    setPendingRoute(null);
  }, []);

  const enableNotifications = useCallback(async () => {
    const status = await notificationService.requestPushPermission();
    setPermissionStatus(status);
    if (status === 'granted') {
      const token = await notificationService.getExpoPushToken();
      if (token && employeeId) {
        void notificationService.registerPushTokenWithBackend(token, employeeId, personType);
      }
    }
  }, [employeeId, personType]);

  const value: NotificationsContextValue = {
    notifications,
    unreadCount,
    ready,
    permissionStatus,
    pendingRoute,
    latestArrival,
    dismissArrival,
    markRead,
    markAllRead,
    removeNotification,
    consumePendingRoute,
    enableNotifications,
    refresh,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
