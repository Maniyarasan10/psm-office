import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { LeaveStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import CalendarSheet, { DatePickerMode } from '../components/leave/calendar-sheet';
import { useLeave, LeaveSubmitResult } from '../hooks/useLeave';
import {
  LEAVE_TYPES,
  LeaveType,
  formatDateField,
  formatDateLong,
  formatRange,
  leaveDayCount,
  maxLeaveDate,
  minLeaveDate,
  todayIso,
  validateLeaveDates,
} from '../utils/leave';

type Props = NativeStackScreenProps<LeaveStackParamList, 'ApplyLeave'>;

interface SuccessState {
  leaveType: LeaveType;
  range: string;
  dayCount: number;
}

export default function ApplyLeaveScreen({ navigation }: Props) {
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const { submitting, actionError, submit } = useLeave(
    personId ? { personId, personType: personTypeValue } : null
  );

  const today = useMemo(() => todayIso(), []);
  const minDate = useMemo(() => minLeaveDate(today), [today]);
  const maxDate = useMemo(() => maxLeaveDate(today), [today]);

  const [leaveType, setLeaveType] = useState<LeaveType>('Casual');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [sheetMode, setSheetMode] = useState<DatePickerMode | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dateValidation = useMemo(
    () => validateLeaveDates(startDate, endDate, today),
    [startDate, endDate, today]
  );
  const dayCount = dateValidation.ok ? leaveDayCount(startDate, endDate) : 0;
  const rangeLabel = dateValidation.ok ? formatRange(startDate, endDate) : '';

  const openSheet = useCallback((mode: DatePickerMode) => {
    setSheetMode(mode);
  }, []);

  const handlePick = useCallback(
    (date: string) => {
      if (sheetMode === 'start') {
        setStartDate(date);
        setEndDate(current => (current < date ? date : current));
      } else if (sheetMode === 'end') {
        setEndDate(date);
      }
      setSheetMode(null);
    },
    [sheetMode]
  );

  const handleSubmit = useCallback(async () => {
    if (!dateValidation.ok || submitting) return;
    setSubmitError(null);
    const result: LeaveSubmitResult = await submit({
      leaveType,
      startDate,
      endDate,
      reason: reason.trim(),
    });
    if (result.ok) {
      setSuccess({
        leaveType,
        range: rangeLabel,
        dayCount,
      });
    } else {
      setSubmitError(result.error ?? 'Unable to submit your leave request.');
    }
  }, [dateValidation, submitting, submit, leaveType, startDate, endDate, reason, rangeLabel, dayCount]);

  const resetForm = useCallback(() => {
    setLeaveType('Casual');
    setStartDate(today);
    setEndDate(today);
    setReason('');
    setSubmitError(null);
    setSuccess(null);
  }, [today]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header title="Apply Leave" leftIcon="arrow-left" onLeftPress={() => navigation.goBack()} showShadow />

      {success ? (
        <SuccessView success={success} onReset={resetForm} onDone={() => navigation.goBack()} />
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.sectionLabel}>Leave type</Text>
          <View style={styles.chipsRow}>
            {LEAVE_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, leaveType === type && styles.chipSelected]}
                onPress={() => setLeaveType(type)}
                accessibilityRole="button"
                accessibilityLabel={`${type} leave`}
                accessibilityState={{ selected: leaveType === type }}
              >
                <Text style={[styles.chipText, leaveType === type && styles.chipTextSelected]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Dates</Text>
          <View style={styles.dateFields}>
            <DateField
              label="Start date"
              value={startDate}
              onPress={() => openSheet('start')}
            />
            <DateField
              label="End date"
              value={endDate}
              onPress={() => openSheet('end')}
            />
          </View>
          {dateValidation.error && (
            <View style={styles.fieldError} accessibilityRole="alert">
              <MaterialCommunityIcons name="alert-circle-outline" size={15} color={colors.error} />
              <Text style={styles.fieldErrorText}>{dateValidation.error}</Text>
            </View>
          )}

          {dateValidation.ok && (
            <View style={styles.duration}>
              <View style={styles.durationIcon}>
                <MaterialCommunityIcons name="calendar-range" size={20} color={colors.primary} />
              </View>
              <View style={styles.durationTextWrap}>
                <Text style={styles.durationRange}>{rangeLabel}</Text>
                <Text style={styles.durationCaption}>Total days selected</Text>
              </View>
              <View style={styles.durationPill}>
                <Text style={styles.durationPillText}>
                  {dayCount} {dayCount === 1 ? 'day' : 'days'}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.sectionLabel}>Reason</Text>
          <Input
            label="Reason (optional)"
            placeholder={"Why are you taking leave?"}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            maxLength={500}
            style={{ minHeight: 110, textAlignVertical: 'top', paddingTop: spacing.md }}
            accessibilityLabel="Reason for leave (optional)"
          />

          <View style={styles.note}>
            <MaterialCommunityIcons name="information-outline" size={18} color={colors.info} />
            <Text style={styles.noteText}>
              Your request goes to the office for approval. Once approved, the days are marked as
              Leave on your attendance record.
            </Text>
          </View>

          {actionError && (
            <View style={styles.submitError} accessibilityRole="alert">
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.submitErrorText}>{actionError}</Text>
            </View>
          )}
          {submitError && (
            <View style={styles.submitError} accessibilityRole="alert">
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.submitErrorText}>{submitError}</Text>
            </View>
          )}

          <Button
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!dateValidation.ok || submitting}
            onPress={() => {
              void handleSubmit();
            }}
            style={styles.submitButton}
            accessibilityLabel="Submit leave request"
          >
            Submit leave request
          </Button>
          <Text style={styles.submitHint}>
            Your request will be reviewed by the office. Track its status on the Leave screen.
          </Text>
        </ScrollView>
      )}

      <CalendarSheet
        visible={sheetMode !== null}
        mode={sheetMode ?? 'start'}
        value={sheetMode === 'start' ? startDate : endDate}
        otherValue={sheetMode === 'end' ? startDate : undefined}
        minDate={minDate}
        maxDate={maxDate}
        onConfirm={handlePick}
        onClose={() => setSheetMode(null)}
      />
    </SafeAreaView>
  );
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.dateField}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatDateLong(value)}`}
    >
      <View style={styles.dateFieldIcon}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.dateFieldTextWrap}>
        <Text style={styles.dateFieldLabel}>{label}</Text>
        <Text style={styles.dateFieldValue}>{formatDateField(value)}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function SuccessView({
  success,
  onReset,
  onDone,
}: {
  success: SuccessState;
  onReset: () => void;
  onDone: () => void;
}) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.successContent}
      showsVerticalScrollIndicator={false}
    >
      <MaterialCommunityIcons name="check-circle" size={52} color={colors.success} />
      <Text style={styles.successTitle}>Leave request submitted.</Text>
      <Text style={styles.successSubtitle}>
        Your request is now pending approval by the office.
      </Text>

      <View style={styles.successCard}>
        <Text style={styles.successType}>{success.leaveType} leave</Text>
        <Text style={styles.successRange}>{success.range}</Text>
        <View style={styles.successPill}>
          <Text style={styles.successPillText}>
            {success.dayCount} {success.dayCount === 1 ? 'day' : 'days'}
          </Text>
        </View>
      </View>

      <View style={styles.successPending} accessibilityRole="alert">
        <MaterialCommunityIcons name="clock-outline" size={16} color={colors.warning} />
        <Text style={styles.successPendingText}>
          You can track whether it is approved or rejected on the Leave screen.
        </Text>
      </View>

      <Button variant="secondary" size="lg" onPress={onReset} style={styles.successButton}>
        Submit another request
      </Button>
      <Button variant="primary" size="lg" onPress={onDone} style={styles.successButton}>
        Done
      </Button>

      <Text style={styles.successHint}>
        Approved days are marked as Leave on your attendance record.
      </Text>
    </ScrollView>
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
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.backgroundLite,
  },
  chipText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  dateFields: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  dateFieldIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateFieldTextWrap: {
    flex: 1,
  },
  dateFieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  dateFieldValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  fieldError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldErrorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.large,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  durationIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationTextWrap: {
    flex: 1,
  },
  durationRange: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  durationCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  durationPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  durationPillText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.infoTint,
    borderRadius: radius.large,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  noteText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 21,
  },
  submitError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  submitErrorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
  submitButton: {
    marginTop: spacing.xl,
  },
  submitHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  successContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['3xl'],
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
  },
  successTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    maxWidth: 320,
  },
  successCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    padding: spacing.lg,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  successType: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  successRange: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  successPill: {
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.md,
  },
  successPillText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  successPending: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warningTint,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  successPendingText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 21,
  },
  successButton: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  successHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
});