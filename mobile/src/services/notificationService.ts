import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  updatePushToken,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from './api';
import type { ServerNotification } from '../notifications/types';
import ENV from '../config/env';

const CHANNEL_ID = 'psm-office-channel';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

// Configure how notifications are presented while the app is foregrounded.
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Android requires notifications to be attached to a channel.
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const desired = {
    name: 'PSM Office',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    lightColor: '#4338ca',
    vibrationPattern: [0, 250, 250, 250],
  };
  try {
    // Android locks a channel's importance after creation, so an existing
    // channel must be recreated for a higher importance to take effect.
    const existing = await Notifications.getNotificationChannelAsync(CHANNEL_ID);
    if (existing && existing.importance !== desired.importance) {
      await Notifications.deleteNotificationChannelAsync(CHANNEL_ID);
    }
  } catch {
    // Non-fatal: fall through and attempt to (re)create the channel below.
  }
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, desired);
}

export type PushPermissionInfo = {
  status: PushPermissionStatus;
  canAskAgain: boolean;
};

// Read the current permission state without prompting the user.
export async function getPushPermission(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

// Android reports "denied" (not "undetermined") for an app that has never been
// asked, because notifications stay disabled until the first grant. Callers need
// canAskAgain to tell "not asked yet" from "permanently denied".
export async function getPushPermissionInfo(): Promise<PushPermissionInfo> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    const normalized: PushPermissionStatus =
      status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
    return { status: normalized, canAskAgain };
  } catch {
    return { status: 'undetermined', canAskAgain: true };
  }
}

// Explicitly ask the user for permission. Returns the resulting status.
export async function requestPushPermission(): Promise<PushPermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

// Fetch the Expo push token (only meaningful when permission is granted).
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: ENV.EXPO_PROJECT_ID,
    });
    return token.data;
  } catch {
    return null;
  }
}

// Best-effort registration with the backend's existing token endpoint.
// Fails silently; push is never a blocker for the app.
export async function registerPushTokenWithBackend(token: string, employeeId: string, personType: string = 'employee'): Promise<boolean> {
  try {
    await updatePushToken(token, employeeId, personType);
    return true;
  } catch {
    return false;
  }
}

// Fetch the persisted inbox so the Notifications screen is populated even when
// a push was missed (app closed, token not yet registered, etc.).
export async function fetchServerNotifications(
  personId: string,
  personType: string = 'employee'
): Promise<ServerNotification[]> {
  const res = await getNotifications(personId, personType);
  return res.data?.notifications ?? [];
}

export async function markServerRead(id: string, personId: string, personType: string = 'employee'): Promise<void> {
  await markNotificationRead(id, personId, personType);
}

export async function markServerAllRead(personId: string, personType: string = 'employee'): Promise<void> {
  await markAllNotificationsRead(personId, personType);
}

// Delete a single server-backed inbox entry (swipe/long-press on the row).
export async function deleteServerNotification(id: string, personId: string, personType: string = 'employee'): Promise<void> {
  await deleteNotification(id, personId, personType);
}

// A push was delivered while the app was in the foreground.
export function addNotificationReceivedListener(
  listener: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(listener);
}

// The user tapped a notification (foreground, background, or killed state).
export function addNotificationResponseListener(
  listener: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

// The notification the app was launched from, when tapped from a killed state.
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}

export function removeNotificationSubscription(subscription: Notifications.Subscription): void {
  subscription.remove();
}

export { CHANNEL_ID };