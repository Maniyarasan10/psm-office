import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { NavigationProp, ParamListBase, useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { profilePhotoUrl } from '../services/api';
import { useNotifications } from '../notifications/NotificationContext';
import { AttendanceRecord, SupportStatusStats, Task } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Avatar } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { IconButton } from '../components/ui/icon-button';
import { StatusBadge } from '../components/ui/status-badge';
import { Modal } from '../components/ui/modal';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import {
  useHomeData,
  getGreeting,
  todayLabel,
  format12Hour,
  formatDuration,
  formatWorkingMinutes,
  formatShortDate,
  relativeDueLabel,
  timeToMinutes,
} from '../hooks/useHomeData';
import { SupportScope, useSupportSummary } from '../hooks/useSupport';
import { useCalendarSummary } from '../hooks/useCalendar';
import { useCompanyStory } from '../hooks/useCompanyStory';
import { HOME_BIRTHDAY_WINDOW, buildCalendarIndex, itemsForDate, upcomingItems } from '../utils/calendar';
import { todayIso as localTodayIso } from '../utils/leave';
import { WorkMetric, buildWorkMetrics, metricValue } from '../utils/workSummary';
import { needsEmployeeAction, openRequestCount } from '../utils/support';
import { MenuRow } from './MoreScreen';

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { employee, personType, logout } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const {
    attendance,
    tasks,
    announcement,
    loading,
    refreshing,
    attendanceError,
    tasksError,
    announcementsError,
    reload,
    refresh,
  } = useHomeData(personId ? { personId, personType: personTypeValue } : null);

  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const { unreadCount } = useNotifications();
  const { mission, vision } = useCompanyStory();

  const supportScope = useMemo<SupportScope | null>(
    () => (personId ? { personId, personType: personTypeValue } : null),
    [personId, personTypeValue]
  );
  const {
    total: supportTotal,
    stats: supportStats,
    loading: supportLoading,
    silentReload: silentSupportReload,
  } = useSupportSummary(supportScope);

  const {
    birthdays,
    loading: birthdaysLoading,
    error: birthdaysError,
    refresh: refreshBirthdays,
  } = useCalendarSummary(HOME_BIRTHDAY_WINDOW);

  const localToday = localTodayIso();
  const calendarIndex = useMemo(
    () => buildCalendarIndex({ tasks, absenceDates: [], birthdays, today: localToday }),
    [tasks, birthdays, localToday]
  );
  const calendarSummary = useMemo(() => {
    const todayCount = itemsForDate(calendarIndex, localToday).length;
    const next = upcomingItems(calendarIndex, localToday, 1)[0] ?? null;
    const parts: string[] = [];
    if (todayCount > 0) parts.push(`${todayCount} item${todayCount === 1 ? '' : 's'} today`);
    if (next) parts.push(`Next: ${next.title} · ${formatShortDate(next.date)}`);
    return { text: parts.join('  ·  '), todayCount, next };
  }, [calendarIndex, localToday]);

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!attendance?.clock_in || attendance?.clock_out) return;
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [attendance?.clock_in, attendance?.clock_out]);

  const didFocusOnce = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnce.current) {
        refresh();
        refreshBirthdays();
      } else {
        didFocusOnce.current = true;
      }
    }, [refresh, refreshBirthdays])
  );

  const supportDidFocusOnce = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (supportDidFocusOnce.current) {
        silentSupportReload();
      } else {
        supportDidFocusOnce.current = true;
      }
    }, [silentSupportReload])
  );

  const handleLogout = () => {
    setShowProfileDialog(false);
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const sortedTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    return [...tasks].sort((a, b) => {
      const aDone = a.status === 'Completed' ? 1 : 0;
      const bDone = b.status === 'Completed' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aDue = a.deadline?.slice(0, 10) ?? '9999';
      const bDue = b.deadline?.slice(0, 10) ?? '9999';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    });
  }, [tasks]);

  // Each task belongs to exactly one section so it is never listed twice:
  // overdue tasks surface in "Needs your attention", future tasks in "Upcoming",
  // and the rest (due today or without a deadline) in "Today's work".
  const todayTasks = useMemo(() => {
    return sortedTasks
      .filter(t => {
        const due = t.deadline?.slice(0, 10);
        return !due || due === todayIso;
      })
      .slice(0, 3);
  }, [sortedTasks, todayIso]);

  const attentionTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== 'Completed' && t.deadline && t.deadline.slice(0, 10) < todayIso)
      .sort((a, b) => {
        const aDue = a.deadline?.slice(0, 10) ?? '';
        const bDue = b.deadline?.slice(0, 10) ?? '';
        return aDue < bDue ? -1 : 1;
      })
      .slice(0, 3);
  }, [tasks, todayIso]);

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== 'Completed' && t.deadline && t.deadline.slice(0, 10) > todayIso)
      .sort((a, b) => {
        const aDue = a.deadline?.slice(0, 10) ?? '';
        const bDue = b.deadline?.slice(0, 10) ?? '';
        return aDue < bDue ? -1 : 1;
      })
      .slice(0, 3);
  }, [tasks, todayIso]);

  const workMetrics = useMemo(() => buildWorkMetrics(tasks, todayIso), [tasks, todayIso]);

  const needsCheckIn = !attendance?.clock_in;
  const isWorking = !!attendance?.clock_in && !attendance?.clock_out;
  const isCompleted = !!attendance?.clock_in && !!attendance?.clock_out;

  const workingMinutes = useMemo(() => {
    if (!isWorking || !attendance?.clock_in) return null;
    const start = timeToMinutes(attendance.clock_in);
    if (start == null) return null;
    const current = now.getHours() * 60 + now.getMinutes();
    return Math.max(0, current - start);
  }, [attendance?.clock_in, isWorking, now]);

  const openTask = useCallback(
    (taskId: string) => navigation.navigate('Tasks', { screen: 'TaskDetail', params: { taskId } }),
    [navigation]
  );

  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      icon: string;
      tone: 'warning' | 'info';
      label: string;
      detail: string;
      onPress: () => void;
    }> = [];

    if (needsCheckIn && !attendanceError) {
      items.push({
        id: 'checkin',
        icon: 'clock-in',
        tone: 'warning',
        label: 'Attendance',
        detail: "You haven't checked in yet today.",
        onPress: () => navigation.navigate('Attendance'),
      });
    }

    attentionTasks.forEach(task => {
      items.push({
        id: `task-${task._id}`,
        icon: 'clipboard-text-outline',
        tone: 'warning',
        label: relativeDueLabel(task.deadline, todayIso) ?? 'Due',
        detail: task.title,
        onPress: () => openTask(task._id),
      });
    });

    return items;
  }, [needsCheckIn, attendanceError, attentionTasks, openTask, todayIso]);

  const allCaughtUp = attentionItems.length === 0 && !attendanceError;

  const avatarSource = profilePhotoUrl(employee?.photo_path);
  const initials = employee?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  const departmentLine = [employee?.department, employee?.designation].filter(Boolean).join(' · ');
  const personLabel = personTypeValue === 'intern' ? 'Intern' : 'Employee';

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <HomeSkeleton />
      </SafeAreaView>
    );
  }

  if (attendanceError && tasksError && announcementsError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <View style={styles.errorContainer} accessibilityRole="alert">
            <MaterialCommunityIcons name="cloud-off-outline" size={44} color={colors.textMuted} />
            <Text style={styles.errorTitle}>Unable to load your dashboard</Text>
            <Text style={styles.errorMessage}>
              We couldn't load your information right now. Check your connection and try again.
            </Text>
            <Button onPress={reload}>Retry</Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name} numberOfLines={1}>{employee?.name ?? 'Employee'}</Text>
            {personTypeValue === 'intern' && employee?.mentor_name ? (
              <Text style={styles.mentorLine} numberOfLines={1}>
                Mentor: {employee.mentor_name}
              </Text>
            ) : null}
            <Text style={styles.dept} numberOfLines={1}>
              {departmentLine || personLabel}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <IconButton
              icon="magnify"
              size="lg"
              color={colors.textSecondary}
              onPress={() => navigation.navigate('Search')}
              accessibilityLabel="Search"
              style={styles.headerIconButton}
            />
            <View style={styles.bellWrap}>
              <IconButton
                icon="bell-outline"
                size="lg"
                color={colors.textSecondary}
                onPress={() => navigation.navigate('Notifications')}
                accessibilityLabel="Notifications"
                style={styles.headerIconButton}
              />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => setShowProfileDialog(true)}
              style={styles.avatarPressable}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              <Avatar source={avatarSource ? { uri: avatarSource } : undefined} size="md" fallbackText={initials} />
            </Pressable>
          </View>
        </View>

        <Text style={styles.dateLabel}>{todayLabel()}</Text>

        <TodayStatusSection
          needsCheckIn={needsCheckIn}
          isWorking={isWorking}
          isCompleted={isCompleted}
          attendance={attendance}
          workingMinutes={workingMinutes}
          error={attendanceError}
          onRetry={reload}
          onOpenAttendance={() => navigation.navigate('Attendance')}
          onViewHistory={() => navigation.navigate('Attendance')}
        />

        <NeedsAttentionSection
          items={attentionItems}
          caughtUp={allCaughtUp}
          error={attendanceError && attentionItems.length === 0}
          onRetry={reload}
        />

        <TodayWorkSection
          tasks={todayTasks}
          todayIso={todayIso}
          error={tasksError}
          onRetry={reload}
          onViewAll={() => navigation.navigate('Tasks')}
          onSelectTask={openTask}
        />

        <AnnouncementsSection
          announcement={announcement}
          error={announcementsError}
          onRetry={reload}
          onView={() => navigation.navigate('Announcements')}
        />

        <WorkSummarySection metrics={workMetrics} onPress={() => navigation.navigate('WorkSummary')} />

        <CalendarSection
          summary={calendarSummary.text}
          loading={birthdaysLoading}
          error={birthdaysError}
          onPress={() => navigation.navigate('Calendar')}
        />

        <DocumentsSection onPress={() => navigation.navigate('Documents')} />

        <SupportSection
          total={supportTotal}
          stats={supportStats}
          loading={supportLoading}
          onPress={() => navigation.navigate('Support')}
        />

        {upcomingTasks.length > 0 && (
          <UpcomingSection
            tasks={upcomingTasks}
            onView={() => navigation.navigate('Tasks')}
            onSelectTask={openTask}
          />
        )}

        <Button
          variant="secondary"
          size="md"
          onPress={() => navigation.navigate('Attendance')}
          style={styles.secondaryFooter}
        >
          View attendance history
        </Button>
      </ScrollView>

      <ProfileDialog
        visible={showProfileDialog}
        onClose={() => setShowProfileDialog(false)}
        onLogout={handleLogout}
        onOpenWorkSummary={() => {
          setShowProfileDialog(false);
          navigation.navigate('WorkSummary');
        }}
        onOpenMoreScreen={screen => {
          setShowProfileDialog(false);
          navigation.navigate('More', { screen });
        }}
        employeeName={employee?.name}
        employeeRole={employee?.designation || employee?.department || personLabel}
        employeeType={personLabel}
        employeeEmail={employee?.email}
        employeePhone={employee?.phone}
        avatarSource={avatarSource}
        initials={initials}
        mission={mission}
        vision={vision}
      />
    </SafeAreaView>
  );
}

/* ----------------------------- Sub-sections ----------------------------- */

function SectionHeader({ title, onAction, actionLabel }: { title: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {onAction && actionLabel && (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function TodayStatusSection({
  needsCheckIn,
  isWorking,
  isCompleted,
  attendance,
  workingMinutes,
  error,
  onRetry,
  onOpenAttendance,
  onViewHistory,
}: {
  needsCheckIn: boolean;
  isWorking: boolean;
  isCompleted: boolean;
  attendance: AttendanceRecord | null;
  workingMinutes: number | null;
  error: boolean;
  onRetry: () => void;
  onOpenAttendance: () => void;
  onViewHistory: () => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader
        title="Today"
        onAction={onViewHistory}
        actionLabel="View attendance"
      />

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Attendance unavailable</Text>
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        </View>
      ) : needsCheckIn ? (
        <Pressable
          onPress={onOpenAttendance}
          style={({ pressed }) => [styles.statusRowCard, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open attendance"
        >
          <View style={styles.statusIconCircle}>
            <MaterialCommunityIcons name="clock-in" size={22} color={colors.textSecondary} />
          </View>
          <View style={styles.statusContent}>
            <Text style={styles.statusPrimary}>Not checked in</Text>
            <Text style={styles.statusSecondary}>You haven't marked your attendance yet.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Pressable
          onPress={onOpenAttendance}
          style={({ pressed }) => [styles.statusCard, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open attendance"
        >
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusItemLabel}>Check in</Text>
              <Text style={styles.statusItemValue}>{format12Hour(attendance?.clock_in)}</Text>
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.statusItem}>
              <Text style={styles.statusItemLabel}>{isWorking ? 'Working' : 'Check out'}</Text>
              <Text style={styles.statusItemValue}>
                {isWorking ? formatWorkingMinutes(workingMinutes) : format12Hour(attendance?.clock_out)}
              </Text>
            </View>
          </View>
          <View style={styles.statusFooter}>
            <StatusBadge status={isCompleted ? 'Completed' : (attendance?.status ?? 'Present')} />
            {isCompleted && attendance?.working_hours != null && (
              <Text style={styles.statusFooterText}>{formatDuration(attendance.working_hours)} today</Text>
            )}
          </View>
        </Pressable>
      )}
    </View>
  );
}

function NeedsAttentionSection({
  items,
  caughtUp,
  error,
  onRetry,
}: {
  items: Array<{ id: string; icon: string; tone: 'warning' | 'info'; label: string; detail: string; onPress: () => void }>;
  caughtUp: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Needs your attention" />
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Couldn't check for items needing your attention</Text>
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (caughtUp) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Needs your attention" />
        <View style={styles.caughtUpRow}>
          <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.success} />
          <Text style={styles.caughtUpText}>You're all caught up.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="Needs your attention" />
      <View style={styles.attentionList}>
        {items.map(item => (
          <Pressable
            key={item.id}
            onPress={item.onPress}
            style={({ pressed }) => [styles.attentionRow, pressed && styles.rowPressed]}
            accessibilityRole="button"
          >
            <View style={[styles.attentionIcon, item.tone === 'warning' ? styles.toneWarning : styles.toneInfo]}>
              <MaterialCommunityIcons name={item.icon} size={20} color={item.tone === 'warning' ? colors.warning : colors.info} />
            </View>
            <View style={styles.attentionContent}>
              <Text style={styles.attentionLabel}>{item.label}</Text>
              <Text style={styles.attentionDetail} numberOfLines={1}>{item.detail}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TodayWorkSection({
  tasks,
  todayIso,
  error,
  onRetry,
  onViewAll,
  onSelectTask,
}: {
  tasks: Task[];
  todayIso: string;
  error: boolean;
  onRetry: () => void;
  onViewAll: () => void;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title="Today's work" onAction={tasks.length > 0 ? onViewAll : undefined} actionLabel="View all" />

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Unable to load your tasks</Text>
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.emptyRow}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={18} color={colors.textMuted} />
          <Text style={styles.emptyText}>Nothing due today.</Text>
        </View>
      ) : (
        <View style={styles.taskList}>
          {tasks.map((task, index) => (
            <Pressable
              key={task._id}
              onPress={() => onSelectTask(task._id)}
              style={({ pressed }) => [
                styles.taskRow,
                index < tasks.length - 1 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Task: ${task.title}`}
            >
              <View style={styles.taskContent}>
                <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                <Text style={styles.taskMeta} numberOfLines={1}>
                  {task.priority}
                  {relativeDueLabel(task.deadline, todayIso) ? ` · ${relativeDueLabel(task.deadline, todayIso)}` : ''}
                </Text>
              </View>
              <StatusBadge status={task.status} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function AnnouncementsSection({
  announcement,
  error,
  onRetry,
  onView,
}: {
  announcement: string;
  error: boolean;
  onRetry: () => void;
  onView: () => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title="Announcements" onAction={announcement ? onView : undefined} actionLabel="View" />

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Announcements unavailable</Text>
          <Pressable onPress={onRetry} accessibilityRole="button">
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        </View>
      ) : announcement ? (
        <Pressable
          onPress={onView}
          style={({ pressed }) => [styles.announcementBox, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open announcements"
        >
          <MaterialCommunityIcons name="bullhorn-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.announcementText} numberOfLines={3}>{announcement}</Text>
        </Pressable>
      ) : (
        <View style={styles.emptyRow}>
          <MaterialCommunityIcons name="bullhorn-outline" size={18} color={colors.textMuted} />
          <Text style={styles.emptyText}>No announcements at this time.</Text>
        </View>
      )}
    </View>
  );
}

function WorkSummarySection({ metrics, onPress }: { metrics: WorkMetric[]; onPress: () => void }) {
  const stats = [
    { label: 'In progress', value: metricValue(metrics, 'in-progress'), color: colors.info },
    { label: 'Due today', value: metricValue(metrics, 'due-today'), color: colors.primary },
    { label: 'Overdue', value: metricValue(metrics, 'overdue'), color: colors.warning },
    { label: 'Completed', value: metricValue(metrics, 'completed'), color: colors.success },
  ];

  return (
    <View style={styles.section}>
      <SectionHeader title="Your work" />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.documentsBox, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open your work summary"
      >
        <View style={styles.workIcon}>
          <MaterialCommunityIcons name="clipboard-text-check-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.documentsContent}>
          <Text style={styles.documentsTitle}>Your work summary</Text>
          <Text style={styles.documentsSubtitle}>Tasks, attendance and time off at a glance</Text>
          <View style={styles.workStatRow}>
            {stats.map(stat => (
              <View key={stat.label} style={styles.workStat}>
                <Text style={[styles.workStatValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.workStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function CalendarSection({
  summary,
  loading,
  error,
  onPress,
}: {
  summary: string;
  loading: boolean;
  error: boolean;
  onPress: () => void;
}) {
  const subtitle = error
    ? "Couldn't load the latest calendar dates"
    : summary
      ? summary
      : loading
        ? 'Loading your dates…'
        : 'Deadlines, birthdays and time off in one place';

  return (
    <View style={styles.section}>
      <SectionHeader title="Calendar" />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.documentsBox, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Open calendar. ${subtitle}`}
      >
        <View style={styles.calendarIcon}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={20} color={colors.primaryPressed} />
        </View>
        <View style={styles.documentsContent}>
          <Text style={styles.documentsTitle}>Calendar</Text>
          <Text style={styles.documentsSubtitle} numberOfLines={2}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function DocumentsSection({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.section}>
      <SectionHeader title="Documents" />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.documentsBox, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open documents"
      >
        <View style={styles.documentsIcon}>
          <MaterialCommunityIcons name="folder-outline" size={20} color={colors.textSecondary} />
        </View>
        <View style={styles.documentsContent}>
          <Text style={styles.documentsTitle}>Documents</Text>
          <Text style={styles.documentsSubtitle}>Access company documents and submit files</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function SupportSection({
  total,
  stats,
  loading,
  onPress,
}: {
  total: number;
  stats?: SupportStatusStats;
  loading: boolean;
  onPress: () => void;
}) {
  const open = openRequestCount(stats);
  const needs = needsEmployeeAction(stats);

  let subtitle = 'Raise a request and follow every reply from the support team';
  if (!loading && (open > 0 || needs > 0)) {
    const parts: string[] = [];
    if (open > 0) parts.push(`${open} open`);
    if (needs > 0) parts.push(`${needs} waiting for you`);
    subtitle = parts.join('  ·  ');
  } else if (!loading && total > 0) {
    subtitle = `${total} request${total === 1 ? '' : 's'}  ·  nothing needs your reply`;
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="Help desk" />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.documentsBox, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open help desk"
      >
        <View style={styles.supportIcon}>
          <MaterialCommunityIcons name="lifebuoy-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.documentsContent}>
          <Text style={styles.documentsTitle}>Help desk</Text>
          <Text style={styles.documentsSubtitle}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * Hermes only parses ISO dates reliably, so the deadline is split into its
 * numeric parts instead of building a "YYYY/MM/DD" string. Returns null for
 * missing or uninterpretable deadlines so callers can fall back to "—".
 */
function upcomingDateOf(deadline?: string): Date | null {
  if (!deadline) return null;
  const [year, month, day] = deadline.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function UpcomingSection({
  tasks,
  onView,
  onSelectTask,
}: {
  tasks: Task[];
  onView: () => void;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title="Upcoming" onAction={onView} actionLabel="View" />
      <View style={styles.upcomingList}>
        {tasks.map(task => {
          const deadlineDate = upcomingDateOf(task.deadline);
          return (
            <Pressable
              key={task._id}
              onPress={() => onSelectTask(task._id)}
              style={({ pressed }) => [styles.upcomingRow, pressed && styles.rowPressed]}
              accessibilityRole="button"
            >
              <View style={styles.upcomingDate}>
                <Text style={styles.upcomingWeekday}>
                  {deadlineDate ? deadlineDate.toLocaleDateString('en-US', { weekday: 'short' }) : '—'}
                </Text>
                <Text style={styles.upcomingDay}>
                  {deadlineDate ? deadlineDate.getDate() : '—'}
                </Text>
              </View>
              <View style={styles.upcomingContent}>
                <Text style={styles.upcomingTitle} numberOfLines={1}>{task.title}</Text>
                <Text style={styles.upcomingMeta}>{formatShortDate(task.deadline?.slice(0, 10) ?? '')} · {task.priority}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ProfileDialog({
  visible,
  onClose,
  onLogout,
  onOpenWorkSummary,
  onOpenMoreScreen,
  employeeName,
  employeeRole,
  employeeType,
  employeeEmail,
  employeePhone,
  avatarSource,
  initials,
  mission,
  vision,
}: {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onOpenWorkSummary: () => void;
  onOpenMoreScreen: (screen: 'Directory' | 'MyProfile' | 'Settings') => void;
  employeeName?: string;
  employeeRole?: string;
  employeeType: string;
  employeeEmail?: string;
  employeePhone?: string;
  avatarSource: string | null;
  initials: string;
  mission?: string;
  vision?: string;
}) {
  return (
    <Modal visible={visible} onClose={onClose} animationType="fade">
      <ScrollView
        style={styles.profileDialogScroll}
        contentContainerStyle={styles.profileDialog}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileDialogHeader}>
          <Avatar source={avatarSource ? { uri: avatarSource } : undefined} size="xl" fallbackText={initials} />
          <View style={styles.profileDialogInfo}>
            <Text style={styles.profileDialogName} numberOfLines={2}>{employeeName ?? 'Employee'}</Text>
            <Text style={styles.profileDialogRole} numberOfLines={1}>{employeeRole}</Text>
            <Text style={styles.profileDialogType}>{employeeType}</Text>
          </View>
          <IconButton icon="close" size="md" onPress={onClose} color={colors.textSecondary} accessibilityLabel="Close profile" />
        </View>

        <View style={styles.profileDialogBody}>
          <View style={styles.profileDetailRow}>
            <MaterialCommunityIcons name="email-outline" size={18} color={colors.textMuted} />
            <Text style={styles.profileDetailText} numberOfLines={1}>{employeeEmail || 'Email not available'}</Text>
          </View>
          <View style={styles.profileDetailRow}>
            <MaterialCommunityIcons name="phone-outline" size={18} color={colors.textMuted} />
            <Text style={styles.profileDetailText} numberOfLines={1}>{employeePhone || 'Phone not available'}</Text>
          </View>
        </View>

        {(mission || vision) && (
          <View style={styles.profileStoryCard}>
            {mission ? (
              <View style={styles.profileStoryBlock}>
                <View style={styles.profileStoryHeader}>
                  <MaterialCommunityIcons name="target" size={18} color={colors.primary} />
                  <Text style={styles.profileStoryTitle}>Our Mission</Text>
                </View>
                <Text style={styles.profileStoryText}>{mission}</Text>
              </View>
            ) : null}
            {mission && vision ? <View style={styles.profileStoryDivider} /> : null}
            {vision ? (
              <View style={styles.profileStoryBlock}>
                <View style={styles.profileStoryHeader}>
                  <MaterialCommunityIcons name="eye-outline" size={18} color={colors.primary} />
                  <Text style={styles.profileStoryTitle}>Our Vision</Text>
                </View>
                <Text style={styles.profileStoryText}>{vision}</Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={styles.profileMenuLabel}>More</Text>
        <View style={styles.profileMenuCard}>
          <MenuRow
            icon="clipboard-text-check-outline"
            label="Your work summary"
            tint={colors.primaryTint}
            onPress={onOpenWorkSummary}
          />
          <View style={styles.profileMenuDivider} />
          <MenuRow
            icon="account-search-outline"
            label="Directory"
            tint={colors.infoLight}
            iconColor={colors.info}
            onPress={() => onOpenMoreScreen('Directory')}
          />
          <View style={styles.profileMenuDivider} />
          <MenuRow
            icon="account-circle-outline"
            label="My profile"
            tint={colors.successLight}
            iconColor={colors.success}
            onPress={() => onOpenMoreScreen('MyProfile')}
          />
          <View style={styles.profileMenuDivider} />
          <MenuRow
            icon="cog-outline"
            label="Settings"
            tint={colors.backgroundLite}
            iconColor={colors.textSecondary}
            onPress={() => onOpenMoreScreen('Settings')}
          />
        </View>

        <View style={styles.profileDialogFooter}>
          <Button variant="ghost" size="md" onPress={onLogout} accessibilityLabel="Log out">
            Log out
          </Button>
        </View>
      </ScrollView>
    </Modal>
  );
}

function HomeSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonLoader width="45%" height={14} style={styles.skeletonSpacing} />
      <SkeletonLoader width="70%" height={24} style={styles.skeletonSpacing} />
      <SkeletonLoader width="35%" height={14} style={styles.skeletonSpacing} />
      <SkeletonLoader height={110} style={styles.skeletonSpacing} />
      <SkeletonLoader height={88} style={styles.skeletonSpacing} />
      <SkeletonLoader height={110} style={styles.skeletonSpacing} />
      <SkeletonLoader height={72} style={styles.skeletonSpacing} />
    </View>
  );
}

/* --------------------------------- Styles --------------------------------- */

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
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
  },
  headerInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  greeting: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  name: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  dept: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  mentorLine: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarPressable: {
    borderRadius: radius.pill,
  },
  dateLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  statusRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  statusIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  statusContent: {
    flex: 1,
  },
  statusPrimary: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  statusSecondary: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusItem: {
    flex: 1,
  },
  statusItemLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  statusItemValue: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  statusDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  statusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  statusFooterText: {
    ...typography.caption,
    color: colors.textSecondary,
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
    minHeight: 56,
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
  rowPressed: {
    opacity: 0.7,
  },
  taskList: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    minHeight: 60,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  taskContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  taskTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  taskMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
  announcementBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  announcementText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    marginLeft: spacing.md,
    lineHeight: 20,
  },
  documentsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  documentsIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentsContent: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  documentsTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  documentsSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  workIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  workStat: {
    marginRight: spacing.lg,
    marginTop: spacing.xs,
  },
  workStatValue: {
    ...typography.subtitle,
    fontWeight: '700',
  },
  workStatLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  upcomingList: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  upcomingDate: {
    width: 44,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  upcomingWeekday: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  upcomingDay: {
    ...typography.title,
    color: colors.primary,
    fontWeight: '700',
  },
  upcomingContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  upcomingTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  upcomingMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    padding: spacing.lg,
  },
  inlineErrorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
    marginRight: spacing.md,
  },
  inlineErrorAction: {
    ...typography.bodyMedium,
    color: colors.error,
    fontWeight: '700',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  errorTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  secondaryFooter: {
    marginTop: spacing.xl,
  },
  profileDialog: {
    padding: spacing['2xl'],
  },
  profileDialogScroll: {
    maxHeight: Math.round(Dimensions.get('window').height * 0.75),
  },
  profileMenuLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  profileMenuCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  profileMenuDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 72,
  },
  profileStoryCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  profileStoryBlock: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  profileStoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileStoryTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  profileStoryText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  profileStoryDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.lg,
  },
  profileDialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileDialogInfo: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  profileDialogName: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  profileDialogRole: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  profileDialogType: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  profileDialogBody: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  profileDetailText: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  profileDialogFooter: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  bellWrap: {
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textInverted,
    fontWeight: '700',
  },
  skeletonWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['2xl'],
  },
  skeletonSpacing: {
    marginBottom: spacing.md,
  },
});
