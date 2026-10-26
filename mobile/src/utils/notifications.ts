import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types';
import type { NotificationRoute, NotificationRouteTarget, NotificationSectionKey } from '../notifications/types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sectionKeyOf(receivedAt: number, now: number): NotificationSectionKey {
  const dayStart = startOfDay(now);
  if (receivedAt >= dayStart) return 'Today';
  if (receivedAt >= dayStart - DAY) return 'Yesterday';
  return 'Earlier';
}

export function relativeTimeLabel(receivedAt: number, now: number): string {
  const diff = Math.max(0, now - receivedAt);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }
  return new Date(receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function categoryLabel(route?: NotificationRoute | null): string {
  switch (route?.target) {
    case 'announcements':
      return 'Announcement';
    case 'tasks':
      return 'Tasks';
    case 'leave':
      return 'Leave';
    case 'attendance':
      return 'Attendance';
    case 'support':
      return 'Support request';
    case 'work':
      return 'Projects';
    case 'reports':
      return 'Work report';
    case 'home':
      return 'System';
    default:
      return 'System';
  }
}

/** MaterialCommunityIcons glyph for a notification's category. */
export function categoryIcon(route?: NotificationRoute | null): string {
  switch (route?.target) {
    case 'announcements':
      return 'bullhorn-outline';
    case 'tasks':
      return 'clipboard-text-outline';
    case 'leave':
      return 'calendar-account-outline';
    case 'attendance':
      return 'clock-outline';
    case 'support':
      return 'lifebuoy';
    case 'work':
      return 'briefcase-outline';
    case 'reports':
      return 'clipboard-text-outline';
    case 'home':
      return 'information-outline';
    default:
      return 'bell-outline';
  }
}

const ROUTE_TARGETS: Record<string, NotificationRouteTarget> = {
  announcements: 'announcements',
  announcement: 'announcements',
  tasks: 'tasks',
  task: 'tasks',
  leave: 'leave',
  attendance: 'attendance',
    support: 'support',
    work: 'work',
    project: 'work',
    projects: 'work',
    home: 'home',
    dashboard: 'home',
    report: 'reports',
    reports: 'reports',
  };

// Resolves the deep-link target from a push payload's `data` map.
// Returns null (no route) when the payload does not declare one.
export function resolveRouteFromData(data?: Record<string, unknown> | null): NotificationRoute | null {
  if (!data || typeof data !== 'object') return null;
  const rawRoute = data['route'] ?? data['screen'];
  if (typeof rawRoute !== 'string') return null;
  const target = ROUTE_TARGETS[rawRoute.toLowerCase()];
  if (!target) return null;

  const route: NotificationRoute = { target };
  if (typeof data['taskId'] === 'string') route.taskId = data['taskId'];
  if (typeof data['announcementId'] === 'string') route.announcementId = data['announcementId'];
  if (typeof data['supportId'] === 'string') route.supportId = data['supportId'];
  if (typeof data['reportId'] === 'string') route.reportId = data['reportId'];
  return route;
}

// Navigates to the screen a notification points at using the existing architecture.
export function navigateToNotificationRoute(
  navigation: { navigate: NavigationProp<RootStackParamList>['navigate'] },
  route: NotificationRoute
): void {
  switch (route.target) {
    case 'home':
      navigation.navigate('MainTabs', { screen: 'Dashboard' });
      return;
    case 'announcements':
      navigation.navigate('MainTabs', { screen: 'Announcements' });
      return;
    case 'tasks':
      navigation.navigate(
        'MainTabs',
        route.taskId
          ? { screen: 'Tasks', params: { screen: 'TaskDetail', params: { taskId: route.taskId } } }
          : { screen: 'Tasks' }
      );
      return;
    case 'leave':
      navigation.navigate('Leave');
      return;
    case 'attendance':
      navigation.navigate('Attendance');
      return;
    case 'work':
      navigation.navigate('MainTabs', { screen: 'Work' });
      return;
    case 'reports':
      navigation.navigate(
        'SubmitReport',
        route.reportId ? { reportId: route.reportId } : undefined
      );
      return;
    case 'support':
      navigation.navigate(
        'Support',
        route.supportId
          ? {
              screen: 'RequestDetail',
              params: { ticketId: route.supportId },
            }
          : { screen: 'SupportHome' }
      );
      return;
    default:
      navigation.navigate('Notifications');
  }
}