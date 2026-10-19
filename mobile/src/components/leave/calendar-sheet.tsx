import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { colors, spacing, radius, typography } from '../../theme';
import {
  formatDateLong,
  formatMonthTitle,
  monthKeyOf,
  monthMatrix,
  todayIso,
  weekdayHeaders,
} from '../../utils/leave';

export type DatePickerMode = 'start' | 'end';

interface CalendarSheetProps {
  visible: boolean;
  mode: DatePickerMode;
  value: string;
  otherValue?: string;
  minDate: string;
  maxDate: string;
  title?: string;
  hint?: string;
  onConfirm: (date: string) => void;
  onClose: () => void;
}

const CELL_SIZE = 44;

export default function CalendarSheet({
  visible,
  mode,
  value,
  otherValue,
  minDate,
  maxDate,
  title,
  hint,
  onConfirm,
  onClose,
}: CalendarSheetProps) {
  const [viewMonth, setViewMonth] = useState<string>(() => {
    const base = value || todayIso();
    return monthKeyOf(base);
  });

  useEffect(() => {
    if (visible) {
      const base = value || todayIso();
      setViewMonth(monthKeyOf(base));
    }
  }, [visible, value]);

  const today = todayIso();
  const minMonth = monthKeyOf(minDate);
  const maxMonth = monthKeyOf(maxDate);

  const [year, month] = useMemo(() => {
    const [y, m] = viewMonth.split('-').map(Number);
    return [y || new Date().getFullYear(), (m || 1) - 1];
  }, [viewMonth]);

  const weeks = useMemo(() => monthMatrix(year, month), [year, month]);
  const headers = weekdayHeaders();

  const canGoPrevious = viewMonth > minMonth;
  const canGoNext = viewMonth < maxMonth;

  const goPrevious = useCallback(() => {
    setViewMonth(current => {
      const [y, m] = current.split('-').map(Number);
      const target = new Date(y, (m || 1) - 2, 1);
      const year = target.getFullYear();
      const month = String(target.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    });
  }, []);

  const goNext = useCallback(() => {
    setViewMonth(current => {
      const [y, m] = current.split('-').map(Number);
      const target = new Date(y, (m || 1), 1);
      const year = target.getFullYear();
      const month = String(target.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    });
  }, []);

  const isEnabled = useCallback(
    (iso: string | null) => (iso ? iso >= minDate && iso <= maxDate : false),
    [minDate, maxDate]
  );

  const inRange = useCallback(
    (iso: string) => {
      if (!otherValue || !value) return false;
      const low = value < otherValue ? value : otherValue;
      const high = value < otherValue ? otherValue : value;
      return iso > low && iso < high;
    },
    [otherValue, value]
  );

  const heading = title ?? (mode === 'start' ? 'Start date' : 'End date');

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          {heading}
        </Text>

        <View style={styles.monthNav}>
          <Pressable
            onPress={goPrevious}
            disabled={!canGoPrevious}
            style={styles.navButton}
            accessibilityLabel="Previous month"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoPrevious }}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={24}
              color={canGoPrevious ? colors.textPrimary : colors.border}
            />
          </Pressable>
          <Text style={styles.monthTitle}>{formatMonthTitle(viewMonth)}</Text>
          <Pressable
            onPress={goNext}
            disabled={!canGoNext}
            style={styles.navButton}
            accessibilityLabel="Next month"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoNext }}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={canGoNext ? colors.textPrimary : colors.border}
            />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {headers.map((header, index) => (
            <View key={`${header}-${index}`} style={styles.weekCell}>
              <Text style={styles.weekHeader}>{header}</Text>
            </View>
          ))}
        </View>

        {weeks.map((week, weekIndex) => (
          <View style={styles.weekRow} key={`week-${weekIndex}`}>
            {week.map((iso, dayIndex) => {
              if (!iso) {
                return <View style={styles.weekCell} key={`blank-${weekIndex}-${dayIndex}`} />;
              }
              const enabled = isEnabled(iso);
              const selected = iso === value;
              const rangeCell = enabled && inRange(iso);
              const isToday = iso === today;
              return (
                <View style={styles.weekCell} key={iso}>
                  <Pressable
                    onPress={() => enabled && onConfirm(iso)}
                    disabled={!enabled}
                    style={[
                      styles.dayCell,
                      rangeCell && styles.dayRange,
                      selected && styles.daySelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={formatDateLong(iso)}
                    accessibilityState={{ selected, disabled: !enabled }}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !enabled && styles.dayTextDisabled,
                        (rangeCell || selected) && styles.dayTextEmphasis,
                        selected && styles.dayTextSelected,
                      ]}
                    >
                      {Number(iso.slice(8, 10))}
                    </Text>
                    {isToday && !selected && <View style={styles.todayDot} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.hint}>
          {hint ?? 'You can select any date within 12 months of today.'}
        </Text>

        <Button variant="secondary" size="md" onPress={onClose}>
          Done
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  monthTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekHeader: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    paddingVertical: spacing.xs,
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayRange: {
    backgroundColor: colors.backgroundLite,
  },
  daySelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  dayTextDisabled: {
    color: colors.border,
  },
  dayTextEmphasis: {
    color: colors.primary,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: colors.textInverted,
  },
  todayDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
});