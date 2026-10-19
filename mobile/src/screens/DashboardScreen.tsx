import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NavigationProp,
  ParamListBase,
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { AttendanceRecord, AttendanceStateKind, RootStackParamList } from '../types';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ErrorState } from '../components/ui/error-state';
import { Header } from '../components/ui/header';
import { StatusBadge } from '../components/ui/status-badge';
import { useBackButton } from '../hooks/useBackButton';
import { useAttendanceDashboard } from '../hooks/useAttendanceDashboard';
import { colors, spacing, radius, typography } from '../theme';
import {
  format12Hour,
  formatDuration,
  formatWorkingMinutes,
  timeToMinutes,
  todayLabel,
} from '../hooks/useHomeData';
import {
  buildMonthlyTrend,
  computeMonthStats,
  currentMonthKey,
  monthLabel,
  MonthStats,
  TrendPoint,
} from '../utils/attendanceStats';

const TREND_MONTHS = 6;

const deriveState = (record: AttendanceRecord | null): AttendanceStateKind => {
  if (!record) return 'not-checked-in';
  if (record.clock_in && record.clock_out) return 'checked-out';
  if (record.clock_in) return 'working';
  if (record.status === 'Absent') return 'absent';
  return 'not-checked-in';
};

const stateCopy: Record<AttendanceStateKind, { title: string; icon: string; bg: string; fg: string }> = {
  'not-checked-in': {
    title: 'Not checked in',
    icon: 'clock-in',
    bg: colors.backgroundLite,
    fg: colors.textSecondary,
  },
  working: {
    title: 'Working',
    icon: 'play-circle-outline',
    bg: colors.infoLight,
    fg: colors.info,
  },
  'checked-out': {
    title: 'Checked out',
    icon: 'check-circle-outline',
    bg: colors.successLight,
    fg: colors.success,
  },
  absent: {
    title: 'Marked absent',
    icon: 'close-circle-outline',
    bg: colors.errorLight,
    fg: colors.error,
  },
};

export default function DashboardScreen() {
  const { employee } = useAuth();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  // This screen is the tab route named "Attendance", so navigating to
  // "Attendance" here would resolve to itself. Reach the root stack's
  // AttendanceScreen through the parent navigator instead.
  const rootNavigation = navigation.getParent<NavigationProp<RootStackParamList>>();
  const openFullAttendance = useCallback(() => {
    const rootTarget = (rootNavigation ?? navigation) as NavigationProp<ParamListBase>;
    rootTarget.navigate('Attendance');
  }, [rootNavigation, navigation]);
  const goBack = useBackButton();
  const personId = employee?._id ?? '';

  const {
    todayRecord,
    records,
    summary,
    officeToday,
    loading,
    refreshing,
    error,
    reload,
    refresh,
  } = useAttendanceDashboard(personId);

  const [now, setNow] = useState(() => new Date());

  const stateKind = deriveState(todayRecord);
  const isWorking = stateKind === 'working';

  useEffect(() => {
    if (!isWorking) return;
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, [isWorking]);

  const workingMinutes = useMemo(() => {
    if (!isWorking || !todayRecord?.clock_in) return null;
    const start = timeToMinutes(todayRecord.clock_in);
    if (start == null) return null;
    const current = now.getHours() * 60 + now.getMinutes();
    return Math.max(0, current - start);
  }, [isWorking, todayRecord?.clock_in, now]);

  const monthKey = currentMonthKey();
  const monthStats = useMemo(() => computeMonthStats(records, monthKey), [records, monthKey]);
  const trend = useMemo(() => buildMonthlyTrend(records, TREND_MONTHS, monthKey), [records, monthKey]);
  const trendMax = useMemo(
    () => Math.max(1, ...trend.map(point => point.value)),
    [trend]
  );

  const didFocusOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnce.current) {
        refresh();
      } else {
        didFocusOnce.current = true;
      }
    }, [refresh])
  );

  // Live attendance status: the backend pushes this when a clock in/out or a
  // status change lands, so the dashboard updates without a manual pull.
  const { subscribe } = useRealtime();
  useEffect(() => {
    if (!personId) return;
    return subscribe('attendance', () => {
      refresh();
    });
  }, [personId, refresh, subscribe]);

  if (!employee) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <Text style={styles.signedOutText}>Please log in to view dashboard</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Attendance"
        subtitle={todayLabel()}
        leftIcon="arrow-left"
        onLeftPress={goBack}
        showShadow
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <ErrorState
          title="Unable to load dashboard"
          message="Check your connection and try again."
          onRetry={reload}
          retryText="Try again"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <StatusHero
            stateKind={stateKind}
            todayRecord={todayRecord}
            workingMinutes={workingMinutes}
            onOpenAttendance={openFullAttendance}
          />

          <MonthStatsCard stats={monthStats} monthKey={monthKey} />

          <TrendCard points={trend} max={trendMax} />

          <AllTimeCard summary={summary} record={todayRecord} />

          <OfficeTodayCard officeToday={officeToday} />

          <LeaveShortcutCard onOpenLeave={() => navigation.navigate('Leave')} />

          <Button
            variant="secondary"
            size="md"
            onPress={openFullAttendance}
            style={styles.footerButton}
          >
            View full attendance
          </Button>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ----------------------------- Sub-sections ----------------------------- */

function StatusHero({
  stateKind,
  todayRecord,
  workingMinutes,
  onOpenAttendance,
}: {
  stateKind: AttendanceStateKind;
  todayRecord: AttendanceRecord | null;
  workingMinutes: number | null;
  onOpenAttendance: () => void;
}) {
  const copy = stateCopy[stateKind];
  const subline =
    stateKind === 'working'
      ? `Started at ${format12Hour(todayRecord?.clock_in)}`
      : stateKind === 'checked-out'
        ? `Clocked out at ${format12Hour(todayRecord?.clock_out)}`
        : stateKind === 'absent'
          ? 'No attendance was recorded for today.'
          : "You haven't marked your attendance today.";

  const badgeStatus =
    todayRecord && ['Late', 'Remote', 'Office'].includes(todayRecord.status)
      ? todayRecord.status
      : copy.title;

  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroTopRow}>
        <View style={[styles.heroIcon, { backgroundColor: copy.bg }]}>
          <MaterialCommunityIcons name={copy.icon} size={26} color={copy.fg} />
        </View>
        <View style={styles.heroHeadline}>
          <Text style={styles.heroTitle}>{copy.title}</Text>
          <Text style={styles.heroSub}>{subline}</Text>
        </View>
        <StatusBadge status={badgeStatus} />
      </View>

      {stateKind === 'working' && (
        <View style={styles.timerBox}>
          <Text style={styles.timerLabel}>Working for</Text>
          <Text style={styles.timerValue}>{formatWorkingMinutes(workingMinutes)}</Text>
        </View>
      )}

      <View style={styles.timesRow}>
        <TimeBlock label="Check in" value={format12Hour(todayRecord?.clock_in)} />
        <View style={styles.timeDivider} />
        <TimeBlock
          label={stateKind === 'working' ? 'Working now' : 'Check out'}
          value={
            stateKind === 'working'
              ? formatWorkingMinutes(workingMinutes)
              : format12Hour(todayRecord?.clock_out)
          }
        />
      </View>

      <Button
        variant="ghost"
        size="md"
        onPress={onOpenAttendance}
        style={styles.heroButton}
      >
        View full attendance
      </Button>
    </Card>
  );
}

function TimeBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timeBlock}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Text style={styles.timeValue}>{value}</Text>
    </View>
  );
}

function MonthStatsCard({ stats, monthKey }: { stats: MonthStats; monthKey: string }) {
  const rate = Math.max(0, Math.min(100, stats.attendanceRate));
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>This month</Text>
        <Text style={styles.sectionCaption}>{monthLabel(monthKey)}</Text>
      </View>
      <Card>
        <View style={styles.statGrid}>
          <StatCell label="Present" value={String(stats.present)} color={colors.success} />
          <StatCell label="Absent" value={String(stats.absent)} color={colors.error} />
          <StatCell label="Late" value={String(stats.late)} color={colors.warning} />
          <StatCell label="Hours" value={formatDuration(stats.totalHours)} color={colors.info} />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${rate}%` }]} />
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{stats.attendanceRate}% attendance</Text>
          <Text style={styles.footerText}>
            Avg {formatDuration(stats.avgHours)} / day
          </Text>
        </View>
      </Card>
    </View>
  );
}

function TrendCard({ points, max }: { points: TrendPoint[]; max: number }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Last {points.length} months</Text>
        <Text style={styles.sectionCaption}>Days present</Text>
      </View>
      <Card>
        <View style={styles.trendRow}>
          {points.map(point => {
            const height = point.value > 0 ? Math.max(6, Math.round((point.value / max) * 72)) : 3;
            return (
              <View key={point.key} style={styles.trendBarWrap}>
                <Text style={styles.trendValue}>{point.value}</Text>
                <View style={styles.trendBarTrack}>
                  <View style={[styles.trendBar, { height }]} />
                </View>
                <Text style={styles.trendLabel}>{point.label}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

function AllTimeCard({
  summary,
  record,
}: {
  summary: { present: number; absent: number; late: number; total_hours: number; attendance_rate: number } | null;
  record: AttendanceRecord | null;
}) {
  if (!summary) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>All time</Text>
        {record?.clock_in && <Text style={styles.sectionCaption}>Keep it up</Text>}
      </View>
      <Card>
        <View style={styles.statGrid}>
          <StatCell label="Present" value={String(summary.present)} color={colors.success} />
          <StatCell label="Absent" value={String(summary.absent)} color={colors.error} />
          <StatCell label="Late" value={String(summary.late)} color={colors.warning} />
          <StatCell label="Worked" value={formatDuration(summary.total_hours)} color={colors.info} />
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{summary.attendance_rate}% attendance</Text>
          <Text style={styles.footerText}>Lifetime record</Text>
        </View>
      </Card>
    </View>
  );
}

function OfficeTodayCard({ officeToday }: { officeToday: Record<string, number> | null }) {
  if (!officeToday) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Office today</Text>
      </View>
      <Card>
        <View style={styles.statGrid}>
          <StatCell label="Present" value={String(officeToday.present ?? 0)} color={colors.success} />
          <StatCell label="Absent" value={String(officeToday.absent ?? 0)} color={colors.error} />
          <StatCell label="Late" value={String(officeToday.late ?? 0)} color={colors.warning} />
        </View>
      </Card>
    </View>
  );
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LeaveShortcutCard({ onOpenLeave }: { onOpenLeave: () => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Leave</Text>
        <Text style={styles.sectionCaption}>Time off</Text>
      </View>
      <Card padding={false}>
        <Pressable
          onPress={onOpenLeave}
          style={({ pressed }) => [styles.leaveRow, pressed && styles.leaveRowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open leave and time off">
          <View style={styles.leaveIcon}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.leaveContent}>
            <Text style={styles.leaveTitle}>Leave & time off</Text>
            <Text style={styles.leaveSubtitle}>View leave history and apply for leave</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
        </Pressable>
      </Card>
    </View>
  );
}

/* --------------------------------- Styles --------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLite,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundLite,
  },
  signedOutText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  heroCard: {
    padding: spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  heroHeadline: {
    flex: 1,
    marginRight: spacing.sm,
  },
  heroTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  heroSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  timerBox: {
    alignItems: 'center',
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.medium,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  timerLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  timerValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.xs,
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  timeBlock: {
    flex: 1,
    alignItems: 'center',
  },
  timeDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  timeLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  timeValue: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  heroButton: {
    marginTop: spacing.md,
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
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
  },
  sectionCaption: {
    ...typography.caption,
    color: colors.textMuted,
  },
  statGrid: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typography.title,
    fontWeight: '700',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  leaveRowPressed: {
    opacity: 0.7,
  },
  leaveIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoLight,
    marginRight: spacing.md,
  },
  leaveContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  leaveTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  leaveSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  trendBarWrap: {
    flex: 1,
    alignItems: 'center',
  },
  trendValue: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  trendBarTrack: {
    height: 76,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBar: {
    width: 22,
    borderRadius: radius.small,
    backgroundColor: colors.primaryLight,
  },
  trendLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  footerButton: {
    marginTop: spacing.xl,
  },
});
