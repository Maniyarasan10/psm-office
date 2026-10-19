import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList, Task } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { StatusBadge } from '../components/ui/status-badge';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { ErrorState } from '../components/ui/error-state';
import { TaskRow } from './TasksScreen';
import { useWorkSummary } from '../hooks/useWorkSummary';
import { formatDateField, formatDateLong, formatMonthTitle, monthKeyOf, todayIso } from '../utils/leave';
import { dueInfo, formatDeadlineLong, formatTimestamp, priorityMeta } from '../utils/tasks';
import {
  MetricTone,
  WorkMetric,
  absencesInWindow,
  attentionTasks,
  buildWorkMetrics,
  monthAttendance,
  openTasksOrdered,
  recentCompleted,
} from '../utils/workSummary';

const ATTENTION_LIMIT = 5;
const ACTIVE_LIMIT = 6;
const COMPLETED_LIMIT = 4;
const ABSENCE_WINDOW_DAYS = 30;

type WorkNav = NativeStackNavigationProp<RootStackParamList, 'WorkSummary'>;

interface AttentionItem {
  id: string;
  icon: string;
  tone: 'warning' | 'info';
  label: string;
  detail: string;
  onPress: () => void;
}

function toneColor(tone: MetricTone): string {
  switch (tone) {
    case 'primary':
      return colors.primary;
    case 'info':
      return colors.info;
    case 'warning':
      return colors.warning;
    case 'success':
      return colors.success;
    default:
      return colors.textSecondary;
  }
}

export default function WorkSummaryScreen() {
  const navigation = useNavigation<WorkNav>();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const { tasks, records, loading, refreshing, tasksError, attendanceError, reload, refresh, silentReload } =
    useWorkSummary(personId ? { personId, personType: personTypeValue } : null);

  const today = useMemo(() => todayIso(), []);
  const monthKey = useMemo(() => monthKeyOf(today), [today]);

  const didFocusOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnce.current) silentReload();
      else didFocusOnce.current = true;
    }, [silentReload])
  );

  const metrics = useMemo(() => buildWorkMetrics(tasks, today), [tasks, today]);
  const urgent = useMemo(() => attentionTasks(tasks, today, ATTENTION_LIMIT), [tasks, today]);
  const active = useMemo(() => {
    const urgentIds = new Set(urgent.map(task => task._id));
    return openTasksOrdered(tasks, today)
      .filter(task => !urgentIds.has(task._id))
      .slice(0, ACTIVE_LIMIT);
  }, [tasks, today, urgent]);
  const completed = useMemo(() => recentCompleted(tasks, COMPLETED_LIMIT), [tasks]);
  const month = useMemo(() => monthAttendance(records, monthKey), [records, monthKey]);
  const absence = useMemo(
    () => absencesInWindow(records, today, ABSENCE_WINDOW_DAYS),
    [records, today]
  );

  const checkedInToday = useMemo(
    () => records.some(record => record.date === today && !!record.clock_in),
    [records, today]
  );

  const openTask = useCallback(
    (taskId: string) =>
      navigation.navigate('MainTabs', {
        screen: 'Tasks',
        params: { screen: 'TaskDetail', params: { taskId } },
      }),
    [navigation]
  );

  const openTasksTab = useCallback(
    () => navigation.navigate('MainTabs', { screen: 'Tasks' }),
    [navigation]
  );
  const openAttendance = useCallback(() => navigation.navigate('Attendance'), [navigation]);
  const openLeave = useCallback(
    () => navigation.navigate('Leave'),
    [navigation]
  );

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    if (!attendanceError && !checkedInToday) {
      items.push({
        id: 'check-in',
        icon: 'clock-in',
        tone: 'info',
        label: 'Attendance',
        detail: "You haven't marked attendance today.",
        onPress: openAttendance,
      });
    }

    urgent.forEach(task => {
      const due = dueInfo(task.deadline, today);
      items.push({
        id: `task-${task._id}`,
        icon: due.icon,
        tone: 'warning',
        label: due.label,
        detail: task.title,
        onPress: () => openTask(task._id),
      });
    });

    return items.slice(0, ATTENTION_LIMIT);
  }, [attendanceError, checkedInToday, urgent, today, openAttendance, openTask]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style='dark' />
        <Header
          title='Your work'
          subtitle={formatDateLong(today)}
          leftIcon='arrow-left'
          onLeftPress={() => navigation.goBack()}
          showShadow
        />
        <View style={styles.skeletonWrap}>
          <SkeletonLoader width='55%' height={14} style={styles.skeletonSpacing} />
          <SkeletonLoader height={84} style={styles.skeletonSpacing} />
          <SkeletonLoader height={140} style={styles.skeletonSpacing} />
          <SkeletonLoader height={104} style={styles.skeletonSpacing} />
          <SkeletonLoader height={104} style={styles.skeletonSpacing} />
          <SkeletonLoader height={96} style={styles.skeletonSpacing} />
        </View>
      </SafeAreaView>
    );
  }

  if (tasksError && attendanceError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style='dark' />
        <Header
          title='Your work'
          subtitle={formatDateLong(today)}
          leftIcon='arrow-left'
          onLeftPress={() => navigation.goBack()}
          showShadow
        />
        <View style={styles.errorWrap}>
          <ErrorState
            title='Unable to load your work summary'
            message="We couldn't load your tasks or attendance. Check your connection and try again."
            onRetry={reload}
            retryText='Try again'
          />
        </View>
      </SafeAreaView>
    );
  }

  const nothingAssigned = !tasksError && tasks.length === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='Your work'
        subtitle={formatDateLong(today)}
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
        rightIcon='refresh'
        onRightPress={refresh}
        showShadow
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {(tasksError || attendanceError) && (
          <View style={styles.inlineError} accessibilityRole='alert'>
            <MaterialCommunityIcons name='cloud-off-outline' size={18} color={colors.error} />
            <Text style={styles.inlineErrorText}>
              {tasksError
                ? "Couldn't refresh your tasks"
                : "Couldn't refresh your attendance records"}
            </Text>
            <Pressable onPress={reload} accessibilityRole='button' hitSlop={8}>
              <Text style={styles.inlineErrorAction}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!tasksError && (
          <>
            <SectionHeader title='Summary' />
            <View style={styles.metricCard}>
              {metrics.map((metric, index) => (
                <React.Fragment key={metric.key}>
                  {index > 0 && <View style={styles.metricDivider} />}
                  <MetricCell metric={metric} />
                </React.Fragment>
              ))}
            </View>

            <SectionHeader title='Needs your attention' />
            {attentionItems.length === 0 ? (
              <View style={styles.caughtUpRow}>
                <MaterialCommunityIcons name='check-circle-outline' size={18} color={colors.success} />
                <Text style={styles.caughtUpText}>You're all caught up.</Text>
              </View>
            ) : (
              <View style={styles.attentionList}>
                {attentionItems.map(item => (
                  <Pressable
                    key={item.id}
                    onPress={item.onPress}
                    style={({ pressed }) => [styles.attentionRow, pressed && styles.rowPressed]}
                    accessibilityRole='button'
                    accessibilityLabel={`${item.label}. ${item.detail}`}>
                    <View
                      style={[
                        styles.attentionIcon,
                        item.tone === 'warning' ? styles.toneWarning : styles.toneInfo,
                      ]}>
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={20}
                        color={item.tone === 'warning' ? colors.warning : colors.info}
                      />
                    </View>
                    <View style={styles.attentionContent}>
                      <Text style={styles.attentionLabel}>{item.label}</Text>
                      <Text style={styles.attentionDetail} numberOfLines={1}>
                        {item.detail}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name='chevron-right' size={20} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}

            <SectionHeader
              title='Active tasks'
              onAction={tasks.length > 0 ? openTasksTab : undefined}
              actionLabel='View all'
            />
            {active.length === 0 ? (
              <View style={styles.emptyRow}>
                <MaterialCommunityIcons name='clipboard-text-outline' size={18} color={colors.textMuted} />
                <Text style={styles.emptyText}>
                  {nothingAssigned
                    ? 'No tasks assigned to you right now.'
                    : 'Nothing else is open beyond the items above.'}
                </Text>
              </View>
            ) : (
              active.map(task => (
                <View key={task._id} style={styles.taskRowWrap}>
                  <TaskRow task={task} today={today} onOpen={openTask} />
                </View>
              ))
            )}

            <SectionHeader title='Recently completed' />
            {completed.length === 0 ? (
              <View style={styles.emptyRow}>
                <MaterialCommunityIcons
                  name='check-circle-outline'
                  size={18}
                  color={colors.textMuted}
                />
                <Text style={styles.emptyText}>No completed tasks to show yet.</Text>
              </View>
            ) : (
              <View style={styles.completedList}>
                {completed.map((task, index) => (
                  <CompletedRow
                    key={task._id}
                    task={task}
                    isLast={index === completed.length - 1}
                    onOpen={openTask}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {!attendanceError && (
          <>
            <SectionHeader
              title='Attendance context'
              onAction={openAttendance}
              actionLabel='History'
            />
            <View style={styles.card}>
              <Text style={styles.cardCaption}>{formatMonthTitle(monthKey)}</Text>
              {month.recorded === 0 ? (
                <Text style={styles.cardEmpty}>
                  No attendance recorded for this month yet.
                </Text>
              ) : (
                <View style={styles.statRow}>
                  {month.counts.map(entry => (
                    <View key={entry.status} style={styles.statCell}>
                      <Text style={styles.statValue}>{entry.count}</Text>
                      <Text style={styles.statLabel}>{entry.status}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Pressable
                onPress={openAttendance}
                style={({ pressed }) => [styles.cardAction, pressed && styles.rowPressed]}
                accessibilityRole='button'
                accessibilityLabel='Open attendance history'>
                <Text style={styles.cardActionText}>View attendance history</Text>
                <MaterialCommunityIcons name='chevron-right' size={18} color={colors.primary} />
              </Pressable>
            </View>

            <SectionHeader title='Time off' onAction={openLeave} actionLabel='Open leave' />
            <View style={styles.card}>
              {absence.count === 0 ? (
                <Text style={styles.cardEmpty}>
                  No absence days recorded in the last {absence.windowDays} days.
                </Text>
              ) : (
                <>
                  <Text style={styles.cardHeadline}>
                    {absence.count} absence day{absence.count === 1 ? '' : 's'} in the last{' '}
                    {absence.windowDays} days
                  </Text>
                  {absence.latestDate && (
                    <Text style={styles.cardCaption}>Latest: {formatDateField(absence.latestDate)}</Text>
                  )}
                </>
              )}
              <Pressable
                onPress={openLeave}
                style={({ pressed }) => [styles.cardAction, pressed && styles.rowPressed]}
                accessibilityRole='button'
                accessibilityLabel='Open leave'>
                <Text style={styles.cardActionText}>Leave and absence days</Text>
                <MaterialCommunityIcons name='chevron-right' size={18} color={colors.primary} />
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.footnote}>
          This summary shows only your own task and attendance records. It is not an evaluation or
          rating of your work.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------- Sub-components ------------------------------ */

function SectionHeader({
  title,
  onAction,
  actionLabel,
}: {
  title: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel} accessibilityRole='header'>
        {title}
      </Text>
      {onAction && actionLabel && (
        <Pressable onPress={onAction} accessibilityRole='button' hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function MetricCell({ metric }: { metric: WorkMetric }) {
  return (
    <View
      style={styles.metricCell}
      accessibilityLabel={`${metric.value} ${metric.label.toLowerCase()}`}>
      <Text style={[styles.metricValue, { color: toneColor(metric.tone) }]}>{metric.value}</Text>
      <Text style={styles.metricLabel}>{metric.label}</Text>
    </View>
  );
}

function CompletedRow({
  task,
  isLast,
  onOpen,
}: {
  task: Task;
  isLast: boolean;
  onOpen: (taskId: string) => void;
}) {
  const priority = priorityMeta(task.priority);
  const metaLine = task.deadline
    ? `Deadline · ${formatDeadlineLong(task.deadline)}`
    : task.updated_at
      ? `Updated ${formatTimestamp(task.updated_at)}`
      : 'No deadline set';

  return (
    <Pressable
      onPress={() => onOpen(task._id)}
      style={({ pressed }) => [
        styles.completedRow,
        !isLast && styles.completedRowDivider,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole='button'
      accessibilityLabel={`${task.title}. Completed. ${metaLine}`}>
      <MaterialCommunityIcons
        name='check-circle-outline'
        size={20}
        color={colors.success}
        style={styles.completedIcon}
      />
      <View style={styles.completedContent}>
        <Text style={styles.completedTitle} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={styles.completedMeta} numberOfLines={1}>
          {metaLine}
        </Text>
      </View>
      <StatusBadge status={task.status} />
    </Pressable>
  );
}

/* ---------------------------------- Styles ---------------------------------- */

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
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  inlineErrorText: {
    ...typography.bodyMedium,
    color: colors.error,
    flex: 1,
  },
  inlineErrorAction: {
    ...typography.bodyMedium,
    color: colors.error,
    fontWeight: '700',
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
  sectionAction: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.borderLight,
  },
  metricValue: {
    ...typography.title,
    fontWeight: '700',
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  caughtUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  caughtUpText: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  attentionList: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    minHeight: 60,
  },
  attentionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  toneWarning: {
    backgroundColor: colors.warningLight,
  },
  toneInfo: {
    backgroundColor: colors.infoLight,
  },
  attentionContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  attentionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  attentionDetail: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  taskRowWrap: {
    marginBottom: spacing.md,
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
    flex: 1,
  },
  completedList: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    minHeight: 64,
  },
  completedRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  completedIcon: {
    marginRight: spacing.md,
  },
  completedContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  completedTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  completedMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardHeadline: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  cardCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cardEmpty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  statCell: {
    minWidth: 72,
    paddingVertical: spacing.xs,
    marginRight: spacing.lg,
  },
  statValue: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  cardActionText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
  rowPressed: {
    opacity: 0.7,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xl,
    lineHeight: 18,
    textAlign: 'center',
  },
});
