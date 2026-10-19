import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';
import { dayAccessibilityLabel, DayMarker, markerForDate, CalendarIndex } from '../../utils/calendar';
import { monthMatrix, weekdayHeaders } from '../../utils/leave';

const EMPTY_MARKER: DayMarker = { leave: false, task: false, birthday: false, count: 0 };

interface MonthGridProps {
  monthKey: string;
  today: string;
  selected: string;
  index: CalendarIndex;
  onSelect: (iso: string) => void;
}

/**
 * Read-only month grid: one column per weekday, one compact marker row per
 * cell. Leave is a neutral cell tint, deadlines and birthdays are single
 * dots — no rainbow calendar.
 */
function MonthGrid({ monthKey, today, selected, index, onSelect }: MonthGridProps) {
  const [year, month] = useMemo(() => {
    const [yearPart, monthPart] = monthKey.split('-').map(Number);
    return [yearPart || new Date().getFullYear(), (monthPart || 1) - 1];
  }, [monthKey]);

  const weeks = useMemo(() => monthMatrix(year, month), [year, month]);
  const headers = useMemo(() => weekdayHeaders(), []);

  const markerOf = useCallback(
    (iso: string): DayMarker => markerForDate(index, iso),
    [index]
  );

  return (
    <View>
      <View style={styles.headerRow} accessibilityElementsHidden importantForAccessibility='no'>
        {headers.map((header, position) => (
          <View key={`${header}-${position}`} style={styles.cell}>
            <Text style={styles.headerText}>{header}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.weekRow}>
          {week.map((iso, dayIndex) => {
            if (!iso) {
              return <View key={`blank-${weekIndex}-${dayIndex}`} style={styles.cell} />;
            }

            const marker = markerOf(iso);
            const isSelected = iso === selected;
            const isToday = iso === today;
            const day = Number(iso.slice(8, 10));

            return (
              <Pressable
                key={iso}
                onPress={() => onSelect(iso)}
                style={[styles.cell, styles.dayCell, marker.leave && styles.dayLeave]}
                accessibilityRole='button'
                accessibilityLabel={dayAccessibilityLabel(iso, marker, today)}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isToday && !isSelected && styles.dayToday,
                    isSelected && styles.daySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isToday && !isSelected && styles.dayTextToday,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                <View style={styles.markerRow}>
                  {marker.task && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                  {marker.birthday && (
                    <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default React.memo(MonthGrid);
export { MonthGrid };

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  dayCell: {
    minHeight: 46,
    paddingVertical: spacing.xs,
    borderRadius: radius.small,
  },
  dayLeave: {
    backgroundColor: colors.backgroundLite,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  daySelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  dayTextToday: {
    color: colors.primary,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: colors.textInverted,
    fontWeight: '700',
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
