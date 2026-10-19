import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { LeaveStackParamList, AttendanceRecord, LeaveRequest, LeaveStatus } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { useLeave } from '../hooks/useLeave';
import { useBackButton } from '../hooks/useBackButton';
import { LEAVE_TYPES, formatDateField, formatDateLong, formatRange } from '../utils/leave';

type LeaveNav = NativeStackNavigationProp<LeaveStackParamList, 'LeaveHome'>;

const STATUS_META: Record<LeaveStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: colors.warning, bg: colors.warningLight },
  approved: { label: 'Approved', color: colors.success, bg: colors.successLight },
  rejected: { label: 'Rejected', color: colors.error, bg: colors.errorLight },
};

function weekdayOf(iso: string): string {
  const first = formatDateLong(iso).split(',')[0];
  return first || '';
}

export default function LeaveScreen() {
  const navigation = useNavigation<LeaveNav>();
  const goBack = useBackButton();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const { absenceDays, requests, loading, refreshing, error, reload, refresh, silentReload } = useLeave(
    personId ? { personId, personType: personTypeValue } : null
  );

  useFocusEffect(
    useCallback(() => {
      silentReload();
    }, [silentReload])
  );

  const openApply = useCallback(() => {
    navigation.navigate('ApplyLeave');
  }, [navigation]);

  const table = useMemo(() => absenceDays.slice(0, 15), [absenceDays]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Leave"
        leftIcon="arrow-left"
        onLeftPress={goBack}
        rightIcon="refresh"
        onRightPress={refresh}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.applyCard}>
          <View style={styles.applyHeader}>
            <View style={styles.applyIcon}>
              <MaterialCommunityIcons name="calendar-check-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.applyTextWrap}>
              <Text style={styles.applyTitle}>Apply for leave</Text>
              <Text style={styles.applySubtitle}>
                Tell the office which days you're away. Your request goes to the office for
                approval.
              </Text>
            </View>
          </View>
          <View style={styles.typeChips}>
            {LEAVE_TYPES.map(type => (
              <View key={type} style={styles.typeChip}>
                <Text style={styles.typeChipText}>{type}</Text>
              </View>
            ))}
          </View>
          <Button variant="primary" size="lg" onPress={openApply} style={styles.applyButton}>
            Apply leave
          </Button>
        </Card>

        <SectionTitle title="My leave requests" />
        {loading ? (
          <Card>
            <SkeletonLoader height={44} style={styles.skeletonSpacing} />
            <SkeletonLoader height={44} style={styles.skeletonSpacing} />
          </Card>
        ) : requests.length === 0 ? (
          <Card style={styles.emptyCard}>
            <MaterialCommunityIcons name="calendar-check-outline" size={20} color={colors.textMuted} />
            <Text style={styles.emptyText}>You haven't applied for leave yet.</Text>
          </Card>
        ) : (
          <Card padding={false} style={styles.listCard}>
            {requests.map((request, index) => (
              <RequestRow
                key={request._id}
                request={request}
                isLast={index === requests.length - 1}
              />
            ))}
          </Card>
        )}

        <SectionTitle title="Leave balance" />
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={18} color={colors.info} />
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoTitle}>Balances aren't tracked in this app yet.</Text>
            <Text style={styles.infoSubtitle}>
              Leave balances will appear here once the office sets up leave tracking. Leave is
              currently recorded day-by-day instead.
            </Text>
          </View>
        </View>

        <SectionTitle title="Leave & absence days" />
        {loading ? (
          <Card>
            <SkeletonLoader height={44} style={styles.skeletonSpacing} />
            <SkeletonLoader height={44} style={styles.skeletonSpacing} />
            <SkeletonLoader height={44} style={styles.skeletonSpacing} />
          </Card>
        ) : error ? (
          <Card style={styles.errorCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
            <Text style={styles.errorText}>Unable to load your absence days.</Text>
            <Button variant="secondary" size="sm" onPress={reload} style={styles.retryButton}>
              Retry
            </Button>
          </Card>
        ) : table.length === 0 ? (
          <Card style={styles.emptyCard}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={20} color={colors.textMuted} />
            <Text style={styles.emptyText}>No days marked absent yet.</Text>
          </Card>
        ) : (
          <Card padding={false} style={styles.listCard}>
            {table.map((record, index) => (
              <AbsenceRow
                key={record._id}
                record={record}
                isLast={index === table.length - 1}
              />
            ))}
          </Card>
        )}

        {!loading && !error && table.length > 0 && (
          <Text style={styles.listFootnote}>
            Absence days are days you didn't clock in. Approved leave is shown as Leave on your
            attendance, not here.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {title}
    </Text>
  );
}

function AbsenceRow({ record, isLast }: { record: AttendanceRecord; isLast: boolean }) {
  return (
    <View
      style={[styles.absenceRow, isLast && styles.absenceRowLast]}
      accessibilityLabel={`${record.date} marked absent`}
    >
      <View style={styles.absenceIcon}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.absenceTextWrap}>
        <Text style={styles.absenceDate}>{formatDateField(record.date)}</Text>
        <Text style={styles.absenceWeekday}>{weekdayOf(record.date)}</Text>
      </View>
      <View style={styles.absenceStatus}>
        <MaterialCommunityIcons name="minus-circle-outline" size={14} color={colors.warning} />
        <Text style={styles.absenceStatusText}>Absent</Text>
      </View>
    </View>
  );
}

function RequestRow({ request, isLast }: { request: LeaveRequest; isLast: boolean }) {
  const meta = STATUS_META[request.status];
  return (
    <View
      style={[styles.absenceRow, isLast && styles.absenceRowLast]}
      accessibilityLabel={`${request.leave_type} leave, ${meta.label}`}
    >
      <View style={[styles.absenceIcon, { backgroundColor: meta.bg }]}>
        <MaterialCommunityIcons name="calendar-check-outline" size={18} color={meta.color} />
      </View>
      <View style={styles.absenceTextWrap}>
        <Text style={styles.absenceDate}>{request.leave_type} leave</Text>
        <Text style={styles.absenceWeekday}>
          {formatRange(request.start_date, request.end_date)} · {request.days}{' '}
          {request.days === 1 ? 'day' : 'days'}
        </Text>
        {request.status === 'rejected' && request.review_note ? (
          <Text style={styles.reviewNote}>{request.review_note}</Text>
        ) : null}
      </View>
      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
        <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  applyCard: {
    borderRadius: radius.large,
  },
  applyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  applyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyTextWrap: {
    flex: 1,
  },
  applyTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  applySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  typeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  typeChip: {
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  typeChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  applyButton: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.infoTint,
    borderRadius: radius.large,
    padding: spacing.lg,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  infoSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  skeletonSpacing: {
    marginBottom: spacing.sm,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  retryButton: {
    alignSelf: 'center',
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  listCard: {
    borderRadius: radius.large,
  },
  absenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
    minHeight: 56,
  },
  absenceRowLast: {
    borderBottomWidth: 0,
  },
  absenceIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  absenceTextWrap: {
    flex: 1,
  },
  absenceDate: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  absenceWeekday: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  absenceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  absenceStatusText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },
  listFootnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    ...typography.caption,
    fontWeight: '700',
  },
  reviewNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
});
