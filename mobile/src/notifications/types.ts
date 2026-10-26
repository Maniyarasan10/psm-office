export type NotificationRouteTarget =
  | 'home'
  | 'announcements'
  | 'tasks'
  | 'leave'
  | 'attendance'
  | 'support'
  | 'work'
  | 'reports';

export interface NotificationRoute {
  target: NotificationRouteTarget;
  taskId?: string;
  announcementId?: string;
  supportId?: string;
  reportId?: string;
}

export interface InAppNotification {
  id: string;
  title: string;
  body?: string;
  receivedAt: number;
  read: boolean;
  route?: NotificationRoute | null;
}

/** A persisted notification as returned by the backend inbox. */
export interface ServerNotification {
  _id: string;
  person_type?: string;
  person_id?: string;
  title: string;
  body?: string;
  route?: string | null;
  category?: string | null;
  ref_id?: string | null;
  read: boolean;
  created_at: string;
}

export type NotificationSectionKey = 'Today' | 'Yesterday' | 'Earlier';

export const NOTIFICATION_STORAGE_KEY = 'psm.inbox.v2';

export const MAX_STORED_NOTIFICATIONS = 100;

/** Prefix for in-app ids derived from the server inbox (vs. a push id). */
export const SERVER_ID_PREFIX = 'srv:';