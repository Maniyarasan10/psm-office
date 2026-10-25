import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  NavigationProp,
  ParamListBase,
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { AttendanceEvent, AttendanceRecord, AttendanceStateKind } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { IconButton } from '../components/ui/icon-button';
import { StatusBadge } from '../components/ui/status-badge';
import { Modal } from '../components/ui/modal';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import EmptyState from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { reverseGeocode, PlaceDetails } from '../utils/location';
import {
  useAttendance,
} from '../hooks/useAttendance';
import {
  format12Hour,
  formatDuration,
  formatWorkingMinutes,
  timeToMinutes,
  todayLabel,
} from '../hooks/useHomeData';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

const shiftMonthKey = (key: string, delta: number): string => {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (key: string): string => {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return `${MONTHS[month - 1]} ${year}`;
};

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

export default function AttendanceScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const isFocused = useIsFocused();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const {
    todayRecord,
    records,
    summary,
    settings,
    loading,
    refreshing,
    recordsError,
    summaryError,
    submitting,
    actionError,
    reload,
    refresh,
    checkIn,
    checkOut,
  } = useAttendance(personId ? { personId, personType: personTypeValue } : null);

  const [now, setNow] = useState(() => new Date());
  const [showOutConfirm, setShowOutConfirm] = useState(false);
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const stateKind = deriveState(todayRecord);
  const needsTick = stateKind === 'working';

  useEffect(() => {
    setNow(new Date());
    if (!isFocused || !needsTick) return;
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [isFocused, needsTick]);

  const didFocusOnce = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnce.current) {
        refresh();
      } else {
        didFocusOnce.current = true;
      }
    }, [refresh])
  );

  // Live attendance status: refresh when the backend announces a change for
  // this person so the in/out state and hours stay current without a pull.
  // Also refresh when admin updates office settings so the late/expected-by
  // label reflects the new office timing immediately.
  const { subscribe } = useRealtime();
  useEffect(() => {
    const offAttendance = subscribe('attendance', () => {
      refresh();
    });
    const offSettings = subscribe('settings', () => {
      refresh();
    });
    return () => {
      offAttendance?.();
      offSettings?.();
    };
  }, [refresh, subscribe]);

  useEffect(() => {
    let cancelled = false;
    const latitude = todayRecord?.latitude;
    const longitude = todayRecord?.longitude;
    if (latitude == null || longitude == null) {
      setPlace(null);
      return;
    }
    reverseGeocode(latitude, longitude).then(result => {
      if (!cancelled) setPlace(result);
    });
    return () => {
      cancelled = true;
    };
  }, [todayRecord?.latitude, todayRecord?.longitude]);

  const workingMinutes = useMemo(() => {
    if (!needsTick || !todayRecord?.clock_in) return null;
    const start = timeToMinutes(todayRecord.clock_in);
    if (start == null) return null;
    const current = now.getHours() * 60 + now.getMinutes();
    return Math.max(0, current - start);
  }, [needsTick, todayRecord?.clock_in, now]);

  const events = useMemo<AttendanceEvent[]>(() => {
    const list: AttendanceEvent[] = [];
    if (todayRecord?.clock_in) {
      list.push({ key: 'in', label: 'Checked in', time: todayRecord.clock_in, kind: 'in' });
    }
    if (todayRecord?.clock_out) {
      list.push({ key: 'out', label: 'Checked out', time: todayRecord.clock_out, kind: 'out' });
    }
    return list;
  }, [todayRecord?.clock_in, todayRecord?.clock_out]);

  const badgeLabel =
    stateKind === 'working'
      ? 'Working'
      : stateKind === 'checked-out'
        ? 'Checked out'
        : stateKind === 'absent'
          ? 'Absent'
          : 'Not checked in';
  const badgeStatus =
    todayRecord && ['Late', 'Remote', 'Office'].includes(todayRecord.status)
      ? todayRecord.status
      : badgeLabel;

  const monthRecords = useMemo(
    () => records.filter(record => record.date.slice(0, 7) === selectedMonth),
    [records, selectedMonth]
  );

  const minMonthKey = useMemo(() => {
    const keys = records.map(record => record.date.slice(0, 7)).sort();
    return keys[0] ?? currentMonthKey;
  }, [records]);

  const canGoPrev = shiftMonthKey(selectedMonth, -1) >= minMonthKey;
  const canGoNext = selectedMonth < currentMonthKey();

  const handleCheckIn = () => {
    void checkIn();
  };

  const handleCheckOutConfirm = async () => {
    await checkOut();
    setShowOutConfirm(false);
  };

  const copy = stateCopy[stateKind];
  const subline =
    stateKind === 'working'
      ? `Started at ${format12Hour(todayRecord?.clock_in)}`
      : stateKind === 'checked-out'
        ? `Clocked out at ${format12Hour(todayRecord?.clock_out)}`
        : stateKind === 'absent'
          ? 'No attendance was recorded for today.'
          : "You haven't marked your attendance today.";

  const isLate = todayRecord?.status === 'Late';
  const showExpected =
    !!settings?.office_start && (stateKind === 'not-checked-in' || isLate);
  const hasCoords = todayRecord?.latitude != null && todayRecord?.longitude != null;

  const renderRecord = ({ item }: { item: AttendanceRecord }) => {
    const [year, month, day] = item.date.split('-').map(Number);
    const dateObj = year && month && day ? new Date(year, month - 1, day) : null;
    const isToday = item.date === todayIso;
    const showLocation = isToday && item.latitude != null && item.longitude != null;

    return (
      <View style={styles.recordCard}>
        <View style={styles.recordTop}>
          <View style={styles.dateCol}>
            <Text style={styles.recordDay}>{dateObj ? dateObj.getDate() : '--'}</Text>
            <Text style={styles.recordWeekday}>
              {dateObj ? dateObj.toLocaleDateString('en-US', { weekday: 'short' }) : ''}
            </Text>
          </View>
          <View style={styles.recordMain}>
            <StatusBadge status={item.status} />
            <View style={styles.timeChips}>
              <TimeChip icon="login" label="IN" value={format12Hour(item.clock_in)} />
              <TimeChip icon="logout" label="OUT" value={format12Hour(item.clock_out)} />
              <TimeChip
                icon="clock-outline"
                label="HRS"
                value={item.working_hours != null ? formatDuration(item.working_hours) : '--'}
              />
            </View>
          </View>
        </View>

        {showLocation && (
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color={colors.success} />
            <Text style={styles.locationText} numberOfLines={1}>
              {place ? place.formattedAddress : `${item.latitude?.toFixed(6)}, ${item.longitude?.toFixed(6)}`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const listHeader = (
    <View>
      {recordsError && (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Couldn't refresh attendance data</Text>
          <Pressable onPress={refresh} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        </View>
      )}

      <SectionLabel title="Current status" />
      <View style={styles.card}>
        <View style={styles.statusTopRow}>
          <View style={[styles.statusIcon, { backgroundColor: copy.bg }]}>
            <MaterialCommunityIcons name={copy.icon} size={22} color={copy.fg} />
          </View>
          <View style={styles.statusHeadline}>
            <Text style={styles.statusTitle}>{copy.title}</Text>
            <Text style={styles.statusSub}>{subline}</Text>
          </View>
          <StatusBadge status={badgeStatus} />
        </View>

        {showExpected && settings?.office_start && (
          <View style={[styles.expectedRow, isLate && styles.expectedRowLate]}>
            <MaterialCommunityIcons
              name={isLate ? 'alert-circle-outline' : 'clock-outline'}
              size={14}
              color={isLate ? colors.warning : colors.textMuted}
            />
            <Text style={[styles.expectedText, isLate && styles.expectedTextLate]}>
              {isLate
                ? `Late · expected by ${format12Hour(settings.office_start)}`
                : `Expected by ${format12Hour(settings.office_start)}`}
            </Text>
          </View>
        )}

        {hasCoords && (
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color={colors.info} />
            <Text style={styles.locationText} numberOfLines={1}>
              {place
                ? place.formattedAddress
                : `${todayRecord?.latitude?.toFixed(6)}, ${todayRecord?.longitude?.toFixed(6)}`}
            </Text>
          </View>
        )}
      </View>

      {todayRecord?.clock_in && (
        <>
          <SectionLabel title="Workday" />
          <View style={[styles.card, styles.workdayCard]}>
            <WorkdayCell icon="login" label="Check in" value={format12Hour(todayRecord.clock_in)} />
            <View style={styles.workdayDivider} />
            <WorkdayCell
              icon="logout"
              label="Check out"
              value={todayRecord.clock_out ? format12Hour(todayRecord.clock_out) : '--:--'}
            />
            <View style={styles.workdayDivider} />
            <WorkdayCell
              icon="clock-outline"
              label="Worked"
              value={
                stateKind === 'working'
                  ? formatWorkingMinutes(workingMinutes)
                  : formatDuration(todayRecord.working_hours)
              }
            />
          </View>
        </>
      )}

      <SectionLabel title="Timeline" />
      <View style={styles.card}>
        {events.length === 0 ? (
          <Text style={styles.timelineEmpty}>No check-in or check-out events yet today.</Text>
        ) : (
          events.map((event, index) => (
            <View key={event.key} style={styles.timelineRow}>
              <View style={styles.timelineMarker}>
                <View
                  style={[
                    styles.timelineDot,
                    { backgroundColor: event.kind === 'in' ? colors.success : colors.error },
                  ]}
                />
                {index < events.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineBody}>
                <Text style={styles.timelineLabel}>{event.label}</Text>
                <Text style={styles.timelineTime}>{format12Hour(event.time)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <SectionLabel
        title="Summary"
        accessory={<Text style={styles.sectionAccessory}>All time</Text>}
      />
      {summaryError ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Summary unavailable</Text>
          <Pressable onPress={reload} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        </View>
      ) : summary ? (
        <View style={styles.card}>
          <View style={styles.summaryGrid}>
            <SummaryCell label="Present" value={String(summary.present)} tone="success" />
            <SummaryCell label="Absent" value={String(summary.absent)} tone="error" />
            <SummaryCell label="Late" value={String(summary.late)} tone="warning" />
            <SummaryCell label="Worked" value={formatDuration(summary.total_hours)} tone="info" />
          </View>
          <View style={styles.summaryFooter}>
            <Text style={styles.summaryFooterText}>
              Avg {formatDuration(summary.avg_hours)} / day
            </Text>
            <Text style={styles.summaryFooterText}>{summary.attendance_rate}% attendance</Text>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <SkeletonLoader height={96} />
        </View>
      )}

      <SectionLabel
        title="History"
        accessory={
          <View style={styles.monthNav}>
            <IconButton
              icon="chevron-left"
              size="sm"
              color={colors.textSecondary}
              disabled={!canGoPrev}
              onPress={() => setSelectedMonth(key => shiftMonthKey(key, -1))}
              accessibilityLabel="Previous month"
            />
            <Text style={styles.monthLabel}>{monthLabel(selectedMonth)}</Text>
            <IconButton
              icon="chevron-right"
              size="sm"
              color={colors.textSecondary}
              disabled={!canGoNext}
              onPress={() => setSelectedMonth(key => shiftMonthKey(key, 1))}
              accessibilityLabel="Next month"
            />
          </View>
        }
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header
          title="Attendance"
          subtitle={todayLabel()}
          leftIcon="arrow-left"
          onLeftPress={() => navigation.goBack()}
          showShadow
        />
        <View style={styles.skeletonWrap}>
          <SkeletonLoader height={116} style={styles.skeletonSpacing} />
          <SkeletonLoader height={92} style={styles.skeletonSpacing} />
          <SkeletonLoader height={56} style={styles.skeletonSpacing} />
          <SkeletonLoader height={140} style={styles.skeletonSpacing} />
          <SkeletonLoader height={120} style={styles.skeletonSpacing} />
        </View>
      </SafeAreaView>
    );
  }

  if (recordsError && records.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header
          title="Attendance"
          subtitle={todayLabel()}
          leftIcon="arrow-left"
          onLeftPress={() => navigation.goBack()}
          showShadow
        />
        <View style={styles.errorWrap}>
          <ErrorState
            title="Unable to load attendance"
            message="We couldn't load your attendance records. Check your connection and try again."
            onRetry={reload}
            retryText="Try again"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Attendance"
        subtitle={todayLabel()}
        leftIcon="arrow-left"
        onLeftPress={() => navigation.goBack()}
        rightIcon="refresh"
        onRightPress={refresh}
        showShadow
      />

      {/* Check-in is the first, most prominent action and stays fixed at the top. */}
      <View style={styles.topCard}>
        {actionError && (
          <View style={styles.actionError}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.actionErrorText}>{actionError}</Text>
          </View>
        )}

        {stateKind === 'checked-out' ? (
          <ActionNotice
            icon="check-circle-outline"
            tone="success"
            title="Workday complete"
            message={`You checked out at ${format12Hour(todayRecord?.clock_out)}.`}
          />
        ) : stateKind === 'absent' ? (
          <ActionNotice
            icon="close-circle-outline"
            tone="error"
            title="Marked absent"
            message="No check-in is available for today."
          />
        ) : (
          <>
            <Button
              variant="primary"
              size="lg"
              loading={submitting}
              onPress={stateKind === 'working' ? () => setShowOutConfirm(true) : handleCheckIn}
              accessibilityLabel={stateKind === 'working' ? 'Check out' : 'Check in'}
              style={styles.checkInButton}
            >
              {stateKind === 'working' ? 'Check Out' : 'Check In'}
            </Button>
            {stateKind === 'not-checked-in' && (
              <Button
                variant="ghost"
                size="md"
                onPress={() => navigation.navigate('Camera')}
                style={styles.gpsButton}
                accessibilityLabel="Check in with location"
              >
                Check in with location
              </Button>
            )}
          </>
        )}
      </View>

      <FlatList
        data={monthRecords}
        keyExtractor={item => item._id || item.date}
        renderItem={renderRecord}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <EmptyState
            title="No records"
            subtitle={`No attendance records for ${monthLabel(selectedMonth)}.`}
            icon="calendar-text"
          />
        }
        contentContainerStyle={
          monthRecords.length === 0 ? styles.emptyContent : styles.listContent
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showOutConfirm} onClose={() => setShowOutConfirm(false)} animationType="fade">
        <View style={styles.outConfirm}>
          <Text style={styles.outConfirmTitle}>Check out?</Text>
          <Text style={styles.outConfirmSub}>Confirm to close your workday for today.</Text>

          <View style={styles.outConfirmRows}>
            <View style={styles.outConfirmRow}>
              <MaterialCommunityIcons name="login" size={18} color={colors.textMuted} />
              <Text style={styles.outConfirmRowLabel}>Checked in</Text>
              <Text style={styles.outConfirmRowValue}>
                {format12Hour(todayRecord?.clock_in)}
              </Text>
            </View>
            <View style={styles.outConfirmRow}>
              <MaterialCommunityIcons name="timer-outline" size={18} color={colors.textMuted} />
              <Text style={styles.outConfirmRowLabel}>Current duration</Text>
              <Text style={styles.outConfirmRowValue}>
                {formatWorkingMinutes(workingMinutes)}
              </Text>
            </View>
          </View>

          <View style={styles.outConfirmActions}>
            <Button
              variant="secondary"
              size="md"
              onPress={() => setShowOutConfirm(false)}
              style={styles.outConfirmButton}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={submitting}
              onPress={() => {
                void handleCheckOutConfirm();
              }}
              style={styles.outConfirmButton}
            >
              Check out
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionLabel({
  title,
  accessory,
}: {
  title: string;
  accessory?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {accessory}
    </View>
  );
}

function WorkdayCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.workdayCell}>
      <MaterialCommunityIcons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.workdayLabel}>{label}</Text>
      <Text style={styles.workdayValue}>{value}</Text>
    </View>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'error' | 'warning' | 'info';
}) {
  const toneColor = {
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
  }[tone];

  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryValue, { color: toneColor }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function TimeChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.timeChip}>
      <View style={styles.timeChipHead}>
        <MaterialCommunityIcons name={icon} size={12} color={colors.textMuted} />
        <Text style={styles.timeChipLabel}>{label}</Text>
      </View>
      <Text style={styles.timeChipValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionNotice({
  icon,
  tone,
  title,
  message,
}: {
  icon: string;
  tone: 'success' | 'error';
  title: string;
  message: string;
}) {
  const palette =
    tone === 'success'
      ? { bg: colors.successLight, fg: colors.success }
      : { bg: colors.errorLight, fg: colors.error };

  return (
    <View style={styles.notice}>
      <View style={[styles.noticeIcon, { backgroundColor: palette.bg }]}>
        <MaterialCommunityIcons name={icon} size={20} color={palette.fg} />
      </View>
      <View style={styles.noticeBody}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeMessage}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
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
    marginBottom: spacing.lg,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  sectionAccessory: {
    ...typography.caption,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  statusHeadline: {
    flex: 1,
    marginRight: spacing.sm,
  },
  statusTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  statusSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  expectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  expectedRowLate: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.small,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 0,
    marginTop: spacing.md,
  },
  expectedText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  expectedTextLate: {
    color: colors.warning,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  locationText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  workdayCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  workdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  workdayDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  workdayLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  workdayValue: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  topCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  checkInButton: {
    width: '100%',
    marginTop: spacing.sm,
  },
  actionError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  actionErrorText: {
    ...typography.bodyMedium,
    color: colors.error,
    flex: 1,
  },
  gpsButton: {
    marginTop: spacing.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  noticeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  noticeBody: {
    flex: 1,
  },
  noticeTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  noticeMessage: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  timelineEmpty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineMarker: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
  },
  timelineBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
    marginLeft: spacing.sm,
  },
  timelineLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  timelineTime: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  summaryGrid: {
    flexDirection: 'row',
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
  summaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  summaryFooterText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  monthLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    minWidth: 76,
    textAlign: 'center',
  },
  recordCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  recordTop: {
    flexDirection: 'row',
  },
  dateCol: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  recordDay: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '800',
    lineHeight: 26,
  },
  recordWeekday: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  recordMain: {
    flex: 1,
  },
  timeChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  timeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.small,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  timeChipHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeChipLabel: {
    ...typography.caption,
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '700',
  },
  timeChipValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: 2,
  },
  outConfirm: {
    padding: spacing['2xl'],
  },
  outConfirmTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  outConfirmSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  outConfirmRows: {
    marginTop: spacing.lg,
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.md,
  },
  outConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  outConfirmRowLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  outConfirmRowValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  outConfirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  outConfirmButton: {
    flex: 1,
  },
});
