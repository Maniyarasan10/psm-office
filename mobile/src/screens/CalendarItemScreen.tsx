import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { NavigationProp, ParamListBase, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CalendarStackParamList, RootStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import ErrorState from '../components/ui/error-state';
import { CALENDAR_KIND } from '../utils/calendar';
import { formatDateLong, formatRange } from '../utils/leave';

type ItemRoute = RouteProp<CalendarStackParamList, 'CalendarItem'>;

export default function CalendarItemScreen() {
  const route = useRoute<ItemRoute>();
  const navigation = useNavigation();
  const item = route.params?.item;

  const rootNavigation = navigation.getParent<NavigationProp<RootStackParamList>>();
  // Falls back to the nearest handle: routes the current stack cannot resolve
  // bubble up to the root navigator, which owns the MainTabs routes.
  const rootTarget = (rootNavigation ?? navigation) as unknown as NavigationProp<ParamListBase>;

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const openTask = useCallback(() => {
    if (!item?.taskId) return;
    rootTarget.navigate('MainTabs', {
      screen: 'Tasks',
      params: { screen: 'TaskDetail', params: { taskId: item.taskId } },
    });
  }, [rootTarget, item?.taskId]);

  const openLeave = useCallback(() => {
    rootTarget.navigate('Leave');
  }, [rootTarget]);

  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style='dark' />
        <Header
          title='Calendar'
          leftIcon='arrow-left'
          onLeftPress={goBack}
          showShadow
        />
        <View style={styles.errorWrap}>
          <ErrorState
            title='Item unavailable'
            message='This calendar item is no longer available. Go back and choose another date.'
            onRetry={goBack}
            retryText='Go back'
          />
        </View>
      </SafeAreaView>
    );
  }

  const kind = CALENDAR_KIND[item.kind];
  const hasRange = !!item.startDate && !!item.endDate && item.startDate !== item.endDate;
  const isTask = item.kind === 'task' && !!item.taskId;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title={kind.label}
        leftIcon='arrow-left'
        onLeftPress={goBack}
        showShadow
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: kind.tint }]}>
            <MaterialCommunityIcons name={kind.icon} size={26} color={kind.color} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} numberOfLines={4}>
              {item.title}
            </Text>
            <Text style={styles.heroMeta}>{item.meta}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <DetailRow
            icon='calendar'
            label={hasRange ? 'Dates' : 'Date'}
            value={
              hasRange
                ? formatRange(item.startDate ?? item.date, item.endDate ?? item.date)
                : formatDateLong(item.date)
            }
          />
          {hasRange && (
            <DetailRow icon='calendar-star' label='This date' value={formatDateLong(item.date)} />
          )}
        </View>

        {item.detail ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel} accessibilityRole='header'>
              Details
            </Text>
            <Text style={styles.detailText}>{item.detail}</Text>
          </View>
        ) : null}

        {(isTask || item.kind === 'leave') && (
          <View style={styles.actions}>
            {isTask && (
              <Button
                variant='primary'
                size='md'
                onPress={openTask}
                style={styles.actionButton}
                accessibilityLabel='Open this task'>
                Open task
              </Button>
            )}
            {item.kind === 'leave' && (
              <Button
                variant='secondary'
                size='md'
                onPress={openLeave}
                style={styles.actionButton}
                accessibilityLabel='Open my leave records'>
                View my leave
              </Button>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} />
      <View style={styles.detailRowText}>
        <Text style={styles.detailRowLabel}>{label}</Text>
        <Text style={styles.detailRowValue}>{value}</Text>
      </View>
    </View>
  );
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  errorWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    padding: spacing.lg,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  heroMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    minHeight: 56,
  },
  detailRowText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  detailRowLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  detailRowValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  detailLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  detailText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  actionButton: {
    width: '100%',
  },
});
