import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../notifications/NotificationContext';
import type { NotificationRoute } from '../notifications/types';
import { categoryIcon, categoryLabel } from '../utils/notifications';
import { colors, radius, shadows, spacing, typography } from '../theme';

const AUTO_DISMISS_MS = 5000;

interface NotificationBannerProps {
  onOpen: (route: NotificationRoute | null) => void;
}

/**
 * Slides a tappable banner in from the top whenever a new notification arrives
 * while the app is open, so people notice it without opening the inbox.
 */
export function NotificationBanner({ onOpen }: NotificationBannerProps) {
  const { latestArrival, dismissArrival } = useNotifications();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!latestArrival) return;

    translateY.setValue(-140);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -140,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) dismissArrival();
      });
    }, AUTO_DISMISS_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [latestArrival, translateY, opacity, dismissArrival]);

  if (!latestArrival) return null;

  const handleOpen = () => {
    if (timer.current) clearTimeout(timer.current);
    const route = latestArrival.route ?? null;
    dismissArrival();
    onOpen(route);
  };

  return (
    <Animated.View
      style={[
        styles.wrap,
        { top: insets.top + spacing.sm, transform: [{ translateY }], opacity },
      ]}
    >
      <Pressable
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={`${latestArrival.title}. ${latestArrival.body ?? ''}`}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.iconBadge}>
          <MaterialCommunityIcons
            name={categoryIcon(latestArrival.route)}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.category}>{categoryLabel(latestArrival.route)}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {latestArrival.title}
          </Text>
          {latestArrival.body ? (
            <Text style={styles.body} numberOfLines={2}>
              {latestArrival.body}
            </Text>
          ) : null}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 1000,
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.elevated,
  },
  cardPressed: {
    opacity: 0.9,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  textWrap: {
    flex: 1,
  },
  category: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default NotificationBanner;
