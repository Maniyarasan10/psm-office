import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Linking,
  RefreshControl,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { useNotifications } from '../notifications/NotificationContext';
import { InAppNotification, NotificationRoute, NotificationSectionKey } from '../notifications/types';
import {
  categoryIcon,
  categoryLabel,
  navigateToNotificationRoute,
  relativeTimeLabel,
  sectionKeyOf,
} from '../utils/notifications';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

interface NotificationSection {
  title: NotificationSectionKey;
  data: InAppNotification[];
}

const SECTION_ORDER: NotificationSectionKey[] = ['Today', 'Yesterday', 'Earlier'];

const DELETE_WIDTH = 92;

export default function NotificationsScreen({ navigation }: Props) {
  const {
    notifications,
    unreadCount,
    ready,
    markRead,
    markAllRead,
    removeNotification,
    permissionStatus,
    enableNotifications,
    refresh,
  } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const now = useMemo(() => Date.now(), [notifications, ready]);

  // Re-sync the persisted inbox whenever the screen gains focus.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const sections = useMemo<NotificationSection[]>(() => {
    const groups = new Map<NotificationSectionKey, InAppNotification[]>();
    for (const item of notifications) {
      const key = sectionKeyOf(item.receivedAt, now);
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
    return SECTION_ORDER.filter(key => groups.has(key)).map(key => ({
      title: key,
      data: groups.get(key) ?? [],
    }));
  }, [notifications, now]);

  const handlePressItem = useCallback(
    (item: InAppNotification) => {
      if (!item.read) markRead(item.id);
      if (item.route) navigateToNotificationRoute(navigation, item.route);
    },
    [markRead, navigation]
  );

  const confirmDelete = useCallback(
    (item: InAppNotification) => {
      Alert.alert('Delete notification', item.title, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeNotification(item.id) },
      ]);
    },
    [removeNotification]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Notifications"
        leftIcon="arrow-left"
        onLeftPress={() => navigation.goBack()}
        rightIcon={unreadCount > 0 ? 'check-all' : undefined}
        onRightPress={unreadCount > 0 ? () => markAllRead() : undefined}
        rightAccessibilityLabel="Mark all as read"
        showShadow
      />

      <SectionList
        style={styles.container}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          notifications.length > 0 ? (
            <Text style={styles.swipeHint}>Swipe left or long-press a notification to delete.</Text>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <SwipeableNotificationRow
            item={item}
            onPress={() => handlePressItem(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
        ListEmptyComponent={
          ready ? (
            <EmptyState
              icon="bell-outline"
              title="No notifications"
              subtitle="Notifications you receive will appear here. You're all caught up."
            />
          ) : (
            <InboxSkeleton />
          )
        }
        ListFooterComponent={<PermissionFooter permissionStatus={permissionStatus} onEnable={enableNotifications} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function categoryTone(route?: NotificationRoute | null): { bg: string; fg: string } {
  switch (route?.target) {
    case 'announcements':
      return { bg: colors.primaryTint, fg: colors.primary };
    case 'tasks':
      return { bg: colors.infoLight, fg: colors.info };
    case 'leave':
      return { bg: colors.successLight, fg: colors.success };
    case 'attendance':
      return { bg: colors.warningLight, fg: colors.warning };
    case 'support':
      return { bg: colors.errorLight, fg: colors.error };
    default:
      return { bg: colors.backgroundLite, fg: colors.textSecondary };
  }
}

function SwipeableNotificationRow({
  item,
  onPress,
  onDelete,
}: {
  item: InAppNotification;
  onPress: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openedRef = useRef(false);

  const settle = useCallback(
    (toValue: number, opened: boolean) => {
      openedRef.current = opened;
      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    },
    [translateX]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderMove: (_event, gesture) => {
          const base = openedRef.current ? -DELETE_WIDTH : 0;
          let next = base + gesture.dx;
          if (next > 0) next = 0;
          if (next < -DELETE_WIDTH) next = -DELETE_WIDTH;
          translateX.setValue(next);
        },
        onPanResponderRelease: (_event, gesture) => {
          const base = openedRef.current ? -DELETE_WIDTH : 0;
          const next = base + gesture.dx;
          const shouldOpen = next <= -DELETE_WIDTH / 2;
          settle(shouldOpen ? -DELETE_WIDTH : 0, shouldOpen);
        },
        onPanResponderTerminate: () =>
          settle(openedRef.current ? -DELETE_WIDTH : 0, openedRef.current),
      }),
    [settle, translateX]
  );

  const handlePress = useCallback(() => {
    if (openedRef.current) {
      settle(0, false);
      return;
    }
    onPress();
  }, [onPress, settle]);

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.deleteAction}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete notification: ${item.title}`}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.textInverted} />
          <Text style={styles.deleteLabel}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <NotificationRow item={item} onPress={handlePress} onLongPress={() => onDelete()} />
      </Animated.View>
    </View>
  );
}

function NotificationRow({
  item,
  onPress,
  onLongPress,
}: {
  item: InAppNotification;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const unread = !item.read;
  const tone = categoryTone(item.route);
  return (
    <TouchableOpacity
      style={[styles.row, unread && styles.rowUnread]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${unread ? ', unread' : ', read'}`}
      accessibilityHint="Long press or swipe left to delete"
      accessibilityState={{ selected: unread }}
    >
      <View style={[styles.iconBadge, { backgroundColor: tone.bg }]}>
        <MaterialCommunityIcons name={categoryIcon(item.route)} size={20} color={tone.fg} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={styles.rowMessage} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text style={styles.rowMeta}>
          {relativeTimeLabel(item.receivedAt, Date.now())} · {categoryLabel(item.route)}
        </Text>
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );
}

function InboxSkeleton() {
  return (
    <View style={styles.skeleton}>
      {[0, 1, 2, 3].map(index => (
        <View key={index} style={styles.skeletonRow}>
          <SkeletonLoader width={40} height={40} borderRadius={12} />
          <View style={styles.skeletonBody}>
            <SkeletonLoader width="70%" height={14} />
            <SkeletonLoader width="50%" height={12} />
            <SkeletonLoader width="35%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

function PermissionFooter({
  permissionStatus,
  onEnable,
}: {
  permissionStatus: 'granted' | 'denied' | 'undetermined' | null;
  onEnable: () => Promise<void>;
}) {
  if (!permissionStatus) return <View style={styles.footerSpacer} />;

  if (permissionStatus === 'denied') {
    return (
      <View style={styles.permissionCard}>
        <MaterialCommunityIcons name="bell-off-outline" size={20} color={colors.textSecondary} />
        <View style={styles.permissionBody}>
          <Text style={styles.permissionTitle}>Notifications are turned off</Text>
          <Text style={styles.permissionText}>Alerts from PSM Office will not be shown.</Text>
        </View>
        <Button variant="secondary" size="sm" onPress={() => Linking.openSettings()}>
          Settings
        </Button>
      </View>
    );
  }

  if (permissionStatus === 'undetermined') {
    return (
      <View style={styles.permissionCard}>
        <MaterialCommunityIcons name="bell-ring-outline" size={20} color={colors.textSecondary} />
        <View style={styles.permissionBody}>
          <Text style={styles.permissionTitle}>Stay informed</Text>
          <Text style={styles.permissionText}>Enable push notifications to receive alerts.</Text>
        </View>
        <Button variant="secondary" size="sm" onPress={() => void onEnable()}>
          Enable
        </Button>
      </View>
    );
  }

  // Enabled (or unknown): nothing extra to show — the list speaks for itself.
  return <View style={styles.footerSpacer} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  swipeHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  swipeWrap: {
    position: 'relative',
    borderRadius: radius.large,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  deleteAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DELETE_WIDTH,
    backgroundColor: colors.error,
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteLabel: {
    ...typography.caption,
    color: colors.textInverted,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.large,
    gap: spacing.md,
  },
  rowUnread: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primaryTint,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  rowTitleUnread: {
    fontWeight: '700',
  },
  rowMessage: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  rowMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
    marginLeft: spacing.xs,
  },
  skeleton: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  skeletonBody: {
    flex: 1,
    gap: 6,
  },
  footerSpacer: {
    height: spacing.xl,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  permissionBody: {
    flex: 1,
  },
  permissionTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  permissionText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
