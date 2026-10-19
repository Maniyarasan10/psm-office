import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  Pressable,
  ScrollView,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { Task, TasksStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { IconButton } from '../components/ui/icon-button';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/ui/status-badge';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { BottomSheet } from '../components/ui/bottom-sheet';
import EmptyState from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { useTasks } from '../hooks/useTasks';
import { useBackButton } from '../hooks/useBackButton';
import {
  activeFilterCount,
  applyTaskFilters,
  buildTaskSections,
  currentLocalIso,
  dueColor,
  dueInfo,
  priorityMeta,
  statusCounts,
  summarizeTasks,
  TaskFilters,
  TaskSection,
  TaskStatusFilter,
  TaskDueFilter,
  TaskPriorityFilter,
  DEFAULT_TASK_FILTERS,
} from '../utils/tasks';

const SEARCH_DEBOUNCE_MS = 250;

const STATUS_OPTIONS: readonly TaskStatusFilter[] = ['All', 'Pending', 'In Progress', 'Completed'];
const PRIORITY_OPTIONS: readonly TaskPriorityFilter[] = ['All', 'High', 'Medium', 'Low'];
const DUE_OPTIONS: readonly TaskDueFilter[] = ['All', 'Overdue', 'Today', 'Upcoming', 'No deadline'];

export default function TasksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TasksStackParamList>>();
  const goBack = useBackButton();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const { tasks, loading, refreshing, error, reload, refresh, silentReload } = useTasks(
    personId ? { personId, personType: personTypeValue } : null
  );

  const [query, setQuery] = useState('');
  const [deferredQuery, setDeferredQuery] = useState('');
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [draftFilters, setDraftFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);

  const today = useMemo(() => currentLocalIso(), []);

  useEffect(() => {
    const timeout = setTimeout(() => setDeferredQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const didFocusOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnce.current) silentReload();
      else didFocusOnce.current = true;
    }, [silentReload])
  );

  const visibleTasks = useMemo(
    () => applyTaskFilters(tasks, filters, deferredQuery, today),
    [tasks, filters, deferredQuery, today]
  );
  const sections = useMemo(() => buildTaskSections(visibleTasks, today), [visibleTasks, today]);
  const summary = useMemo(() => summarizeTasks(tasks, today), [tasks, today]);
  const counts = useMemo(() => statusCounts(tasks), [tasks]);
  const filterCount = useMemo(() => activeFilterCount(filters), [filters]);
  const draftCount = useMemo(
    () => applyTaskFilters(tasks, draftFilters, deferredQuery, today).length,
    [tasks, draftFilters, deferredQuery, today]
  );

  const hasQueryOrFilters = deferredQuery.trim().length > 0 || filterCount > 0;

  const openTask = useCallback(
    (taskId: string) => navigation.navigate('TaskDetail', { taskId }),
    [navigation]
  );

  const openFilterSheet = useCallback(() => {
    setDraftFilters(filters);
    setFilterSheetVisible(true);
  }, [filters]);

  const applyDraft = useCallback(() => {
    setFilters(draftFilters);
    setFilterSheetVisible(false);
  }, [draftFilters]);

  const resetDraft = useCallback(() => setDraftFilters(DEFAULT_TASK_FILTERS), []);

  const resetAll = useCallback(() => {
    setQuery('');
    setDeferredQuery('');
    setFilters(DEFAULT_TASK_FILTERS);
  }, []);

  const renderTask = useCallback(
    ({ item }: { item: Task }) => <TaskRow task={item} today={today} onOpen={openTask} />,
    [today, openTask]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: TaskSection }) => (
      <Text style={styles.sectionHeader} accessibilityRole="header">
        {section.title}
      </Text>
    ),
    []
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header
          title="Tasks"
          subtitle="Loading your tasks"
          leftIcon="arrow-left"
          onLeftPress={goBack}
          rightIcon="refresh"
          onRightPress={refresh}
          showShadow
        />
        <TasksSkeleton />
      </SafeAreaView>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header title="Tasks" leftIcon="arrow-left" onLeftPress={goBack} showShadow />
        <View style={styles.errorWrap}>
          <ErrorState
            title="Unable to load your tasks"
            message="We couldn't load your tasks. Check your connection and try again."
            onRetry={reload}
            retryText="Try again"
          />
        </View>
      </SafeAreaView>
    );
  }

  const subtitle =
    summary.total === 0
      ? 'No tasks yet'
      : `${summary.total} task${summary.total === 1 ? '' : 's'} for you`;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Tasks"
        subtitle={subtitle}
        leftIcon="arrow-left"
        onLeftPress={goBack}
        rightIcon="refresh"
        onRightPress={refresh}
        showShadow
      />

      <SectionList<Task, TaskSection>
        sections={sections}
        keyExtractor={item => item._id}
        renderItem={renderTask}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            {error && tasks.length > 0 && (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>Couldn't refresh your tasks</Text>
                <Pressable onPress={refresh} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.inlineErrorAction}>Retry</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.searchRow}>
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search tasks"
                containerStyle={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel="Search tasks by title, description or note"
              />
              {query.length > 0 && (
                <IconButton
                  icon="close-circle"
                  size="md"
                  color={colors.textMuted}
                  onPress={() => setQuery('')}
                  accessibilityLabel="Clear search"
                />
              )}
              <FilterButton count={filterCount} onPress={openFilterSheet} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {STATUS_OPTIONS.map(option => {
                const active = filters.status === option;
                const count = option === 'All' ? counts.All : counts[option];
                const label = option === 'In Progress' ? 'In progress' : option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setFilters(prev => ({ ...prev, status: option }))}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${label}, ${count} tasks`}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {`${label} (${count})`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {tasks.length > 0 && (
              <View style={styles.summaryCard}>
                <SummaryCell label="Overdue" value={summary.overdue} color={colors.warning} />
                <View style={styles.summaryDivider} />
                <SummaryCell label="Due today" value={summary.dueToday} color={colors.primary} />
                <View style={styles.summaryDivider} />
                <SummaryCell label="Upcoming" value={summary.upcoming} color={colors.textSecondary} />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          hasQueryOrFilters ? (
            <EmptyState
              title="No tasks match"
              subtitle="Try adjusting your search or filters to find what you're looking for."
              icon="magnify"
              actionText="Reset search and filters"
              onAction={resetAll}
            />
          ) : (
            <EmptyState
              title="No tasks assigned"
              subtitle="You're all caught up. Tasks assigned to you will appear here."
              icon="clipboard-text-outline"
            />
          )
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={7}
      />

      <BottomSheet visible={filterSheetVisible} onClose={() => setFilterSheetVisible(false)}>
        <View style={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filter tasks</Text>
            <IconButton
              icon="close"
              size="md"
              color={colors.textSecondary}
              onPress={() => setFilterSheetVisible(false)}
              accessibilityLabel="Close filters"
            />
          </View>

          <FilterOptions
            label="Status"
            options={STATUS_OPTIONS}
            value={draftFilters.status}
            onChange={value => setDraftFilters(prev => ({ ...prev, status: value }))}
          />
          <FilterOptions
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={draftFilters.priority}
            onChange={value => setDraftFilters(prev => ({ ...prev, priority: value }))}
          />
          <FilterOptions
            label="Due"
            options={DUE_OPTIONS}
            value={draftFilters.due}
            onChange={value => setDraftFilters(prev => ({ ...prev, due: value }))}
          />

          <View style={styles.sheetActions}>
            <Button
              variant="secondary"
              size="md"
              onPress={resetDraft}
              style={styles.sheetActionButton}
              accessibilityLabel="Reset filters"
            >
              Reset
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={applyDraft}
              style={styles.sheetActionButton}
              accessibilityLabel={`Show ${draftCount} tasks`}
            >
              {`Show ${draftCount} task${draftCount === 1 ? '' : 's'}`}
            </Button>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ------------------------------- Sub-components ------------------------------ */

export const TaskRow = React.memo(function TaskRow({
  task,
  today,
  onOpen,
}: {
  task: Task;
  today: string;
  onOpen: (taskId: string) => void;
}) {
  const due = dueInfo(task.deadline, today);
  const priority = priorityMeta(task.priority);
  const dueToneColor = dueColor(due.tone);
  const messageCount = task.comments?.length ?? 0;

  return (
    <Pressable
      onPress={() => onOpen(task._id)}
      style={({ pressed }) => [styles.taskRow, pressed && styles.taskRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${task.status}. ${priority.label}. ${due.label}.`}
    >
      <View style={styles.taskRowTop}>
        <Text style={styles.taskTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </View>

      <View style={styles.taskMetaRow}>
        <StatusBadge status={task.status} />
        <View style={styles.priorityWrap}>
          <MaterialCommunityIcons name={priority.icon} size={13} color={priority.color} />
          <Text style={[styles.priorityText, { color: priority.color }]}>{priority.label}</Text>
        </View>
        <Pressable
          onPress={() => onOpen(task._id)}
          hitSlop={8}
          style={({ pressed }) => [styles.messageChip, pressed && styles.taskRowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Messages for ${task.title}, ${messageCount} message${
            messageCount === 1 ? '' : 's'
          }`}
        >
          <MaterialCommunityIcons name="message-outline" size={13} color={colors.primary} />
          <Text style={styles.messageChipText}>{messageCount}</Text>
        </Pressable>
      </View>

      <View style={styles.dueRow}>
        <MaterialCommunityIcons name={due.icon} size={13} color={dueToneColor} />
        <Text style={[styles.dueText, { color: dueToneColor }]}>{due.label}</Text>
      </View>

      {task.created_by_name ? (
        <View style={styles.byRow}>
          <MaterialCommunityIcons
            name="account-arrow-right-outline"
            size={13}
            color={colors.textMuted}
          />
          <Text style={styles.byText} numberOfLines={1}>
            Assigned by {task.created_by_name}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.filterButton, pressed && styles.taskRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Filters, ${count} active` : 'Filters'}
    >
      <MaterialCommunityIcons name="filter-variant" size={20} color={colors.textPrimary} />
      {count > 0 && (
        <View style={styles.filterCount}>
          <Text style={styles.filterCountText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

function SummaryCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FilterOptions<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterGroupLabel}>{label}</Text>
      <View style={styles.filterOptions}>
        {options.map(option => {
          const active = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              style={[styles.filterOption, active && styles.filterOptionActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TasksSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonLoader height={44} style={styles.skeletonSpacing} />
      <SkeletonLoader width="70%" height={36} style={styles.skeletonSpacing} />
      <SkeletonLoader height={84} style={styles.skeletonSpacing} />
      <SkeletonLoader height={104} style={styles.skeletonSpacing} />
      <SkeletonLoader height={104} style={styles.skeletonSpacing} />
      <SkeletonLoader height={104} style={styles.skeletonSpacing} />
    </View>
  );
}

/* ---------------------------------- Styles ---------------------------------- */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  emptyContent: {
    flexGrow: 1,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterCountText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textInverted,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverted,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.title,
    fontWeight: '700',
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.borderLight,
  },
  sectionHeader: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  taskRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  taskRowPressed: {
    opacity: 0.7,
  },
  taskRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  priorityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  priorityText: {
    ...typography.caption,
    fontWeight: '600',
  },
  messageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundLite,
  },
  messageChipText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dueText: {
    ...typography.caption,
    fontWeight: '600',
  },
  byRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  byText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  filterGroup: {
    marginBottom: spacing.lg,
  },
  filterGroupLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterOption: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundLite,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterOptionText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  filterOptionTextActive: {
    color: colors.textInverted,
    fontWeight: '600',
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  sheetActionButton: {
    flex: 1,
  },
});
