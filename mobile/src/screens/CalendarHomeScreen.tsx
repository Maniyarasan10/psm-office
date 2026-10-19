import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CalendarDayItem, CalendarItemKind, CalendarStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { IconButton } from '../components/ui/icon-button';
import EmptyState from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import MonthGrid from '../components/calendar/month-grid';
import AgendaRow from '../components/calendar/agenda-row';
import { useAuth } from '../context/AuthContext';
import { CALENDAR_SOURCE_LABEL, useCalendar } from '../hooks/useCalendar';
import {
  CALENDAR_KIND,
  CALENDAR_LEAVE_WINDOW,
  agendaDateLabel,
  groupByDate,
  itemsForDate,
  shiftMonthKey,
  upcomingItems,
} from '../utils/calendar';
import {
  addDays,
  formatDateField,
  formatDateLong,
  formatMonthTitle,
  isValidLeaveDate,
  monthKeyOf,
  todayIso,
} from '../utils/leave';

type CalendarNav = NativeStackNavigationProp<CalendarStackParamList, 'CalendarHome'>;

const KIND_ORDER: CalendarItemKind[] = ['leave', 'task', 'birthday'];

export default function CalendarHomeScreen() {
  const navigation = useNavigation<CalendarNav>();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const { index, today, loading, refreshing, error, failedSources, reload, refresh, silentReload } =
    useCalendar(personId ? { personId, personType: personTypeValue } : null);

  const [monthKey, setMonthKey] = useState<string>(() => monthKeyOf(todayIso()));
  const [selected, setSelected] = useState<string>(() => todayIso());

  const didFocusOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnce.current) silentReload();
      else didFocusOnce.current = true;
    }, [silentReload])
  );

  const dayItems = useMemo(() => itemsForDate(index, selected), [index, selected]);

  const upcoming = useMemo(
    () => groupByDate(upcomingItems(index, today)),
    [index, today]
  );

  const upcomingCount = useMemo(
    () => upcoming.reduce((total, group) => total + group.items.length, 0),
    [upcoming]
  );

  // Absence history is only requested for the last CALENDAR_LEAVE_WINDOW days,
  // so months before that boundary are honestly labelled instead of looking empty.
  const leaveCutoff = useMemo(() => addDays(today, -CALENDAR_LEAVE_WINDOW), [today]);
  const showsLeaveNote = monthKey < leaveCutoff.slice(0, 7);

  const openItem = useCallback(
    (item: CalendarDayItem) => navigation.navigate('CalendarItem', { item }),
    [navigation]
  );

  // Keeps the selected date inside the month being displayed so the grid never
  // shows a month with no selection while the agenda below refers to another.
  const moveToMonth = useCallback((nextMonthKey: string) => {
    setMonthKey(nextMonthKey);
    setSelected(prev => {
      if (prev.slice(0, 7) === nextMonthKey) return prev;
      const candidate = `${nextMonthKey}-${prev.slice(8, 10)}`;
      return isValidLeaveDate(candidate) ? candidate : `${nextMonthKey}-01`;
    });
  }, []);

  const goToPreviousMonth = useCallback(
    () => moveToMonth(shiftMonthKey(monthKey, -1)),
    [monthKey, moveToMonth]
  );

  const goToNextMonth = useCallback(
    () => moveToMonth(shiftMonthKey(monthKey, 1)),
    [monthKey, moveToMonth]
  );

  const goToToday = useCallback(() => {
    const iso = todayIso();
    setSelected(iso);
    setMonthKey(monthKeyOf(iso));
  }, []);

  const selectDate = useCallback((iso: string) => setSelected(iso), []);

  const subtitle = formatDateLong(today);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style='dark' />
        <Header title='Calendar' subtitle='Loading your schedule' showShadow />
        <CalendarSkeleton />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style='dark' />
        <Header title='Calendar' showShadow />
        <View style={styles.errorWrap}>
          <ErrorState
            title='Unable to load your calendar'
            message="We couldn't load your dates right now. Check your connection and try again."
            onRetry={reload}
            retryText='Try again'
          />
        </View>
      </SafeAreaView>
    );
  }

  const failedLabels = failedSources.map(key => CALENDAR_SOURCE_LABEL[key]).join(', ');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='Calendar'
        subtitle={subtitle}
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
        rightIcon='refresh'
        onRightPress={refresh}
        showShadow
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {failedSources.length > 0 && (
          <View style={styles.inlineError} accessibilityRole='alert'>
            <Text style={styles.inlineErrorText}>
              Some items could not be loaded: {failedLabels}.
            </Text>
            <Pressable onPress={reload} accessibilityRole='button' hitSlop={8}>
              <Text style={styles.inlineErrorAction}>Retry</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.monthBar}>
          <IconButton
            icon='chevron-left'
            size='lg'
            color={colors.textPrimary}
            onPress={goToPreviousMonth}
            accessibilityLabel='Previous month'
          />
          <Text style={styles.monthTitle} accessibilityRole='header' numberOfLines={1}>
            {formatMonthTitle(monthKey)}
          </Text>
          <IconButton
            icon='chevron-right'
            size='lg'
            color={colors.textPrimary}
            onPress={goToNextMonth}
            accessibilityLabel='Next month'
          />
        </View>

        <View style={styles.selectedBar}>
          <Text style={styles.selectedDate} numberOfLines={1} accessibilityRole='text'>
            {formatDateLong(selected)}
          </Text>
          {selected !== today && (
            <Pressable
              onPress={goToToday}
              style={styles.todayButton}
              accessibilityRole='button'
              accessibilityLabel='Return to today'>
              <MaterialCommunityIcons name='calendar-today-outline' size={14} color={colors.primary} />
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <MonthGrid
            monthKey={monthKey}
            today={today}
            selected={selected}
            index={index}
            onSelect={selectDate}
          />
        </View>

        <View style={styles.legend} accessibilityLabel='Calendar markers'>
          {KIND_ORDER.map(kind => {
            const meta = CALENDAR_KIND[kind];
            return (
              <View key={kind} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendMark,
                    kind === 'leave' ? styles.legendMarkLeave : { backgroundColor: meta.color },
                  ]}
                />
                <Text style={styles.legendLabel}>{meta.legend}</Text>
              </View>
            );
          })}
        </View>

        {showsLeaveNote && (
          <Text style={styles.rangeNote}>
            Absence history is recorded for the last {CALENDAR_LEAVE_WINDOW} days, up to{' '}
            {formatDateField(leaveCutoff)}.
          </Text>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel} accessibilityRole='header'>
            {agendaDateLabel(selected, today)}
          </Text>
          <Text style={styles.sectionCount}>
            {dayItems.length === 0
              ? 'No items'
              : `${dayItems.length} item${dayItems.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        {dayItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title='No events scheduled.'
              subtitle='Nothing on your calendar for this date.'
              icon='calendar-blank-outline'
            />
          </View>
        ) : (
          <View style={styles.card}>
            {dayItems.map((item, position) => (
              <AgendaRow
                key={item.id}
                item={item}
                onPress={openItem}
                isLast={position === dayItems.length - 1}
              />
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel} accessibilityRole='header'>
            Upcoming
          </Text>
          <Text style={styles.sectionCount}>
            {upcomingCount === 0
              ? 'Nothing scheduled'
              : `Next ${upcomingCount} item${upcomingCount === 1 ? '' : 's'}`}
          </Text>
        </View>

        {upcomingCount === 0 ? (
          <View style={styles.emptyRow}>
            <MaterialCommunityIcons name='calendar-blank-outline' size={18} color={colors.textMuted} />
            <Text style={styles.emptyText}>No upcoming items.</Text>
          </View>
        ) : (
          upcoming.map(group => (
            <View key={group.date} style={styles.group}>
              <Text style={styles.groupDate} accessibilityRole='header'>
                {agendaDateLabel(group.date, today)}
              </Text>
              <View style={styles.card}>
                {group.items.map((item, position) => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    onPress={openItem}
                    isLast={position === group.items.length - 1}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CalendarSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonLoader height={48} style={styles.skeletonSpacing} />
      <SkeletonLoader height={24} width='55%' style={styles.skeletonSpacing} />
      <SkeletonLoader height={296} style={styles.skeletonSpacing} />
      <SkeletonLoader height={16} width='40%' style={styles.skeletonSpacing} />
      <SkeletonLoader height={72} style={styles.skeletonSpacing} />
      <SkeletonLoader height={72} style={styles.skeletonSpacing} />
      <SkeletonLoader height={72} />
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
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  skeletonWrap: {
    padding: spacing.lg,
  },
  skeletonSpacing: {
    marginBottom: spacing.md,
  },
  errorWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    marginBottom: spacing.md,
  },
  inlineErrorText: {
    ...typography.bodyMedium,
    color: colors.error,
    flex: 1,
    marginRight: spacing.sm,
  },
  inlineErrorAction: {
    ...typography.bodyMedium,
    color: colors.error,
    fontWeight: '700',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  monthTitle: {
    ...typography.subtitle,
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontWeight: '700',
  },
  selectedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  selectedDate: {
    ...typography.bodyMedium,
    flex: 1,
    color: colors.textSecondary,
  },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendMarkLeave: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.backgroundLite,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rangeNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  emptyWrap: {
    minHeight: 176,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
  },
  group: {
    marginTop: spacing.md,
  },
  groupDate: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    padding: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});
