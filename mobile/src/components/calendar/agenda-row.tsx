import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, spacing, radius, typography } from '../../theme';
import { CalendarDayItem } from '../../types';
import { CALENDAR_KIND } from '../../utils/calendar';

interface AgendaRowProps {
  item: CalendarDayItem;
  onPress: (item: CalendarDayItem) => void;
  /** Hides the hairline on the final row of a group. */
  isLast?: boolean;
}

/** One calendar item: tinted icon tile, title, secondary line, disclosure. */
function AgendaRow({ item, onPress, isLast = false }: AgendaRowProps) {
  const kind = CALENDAR_KIND[item.kind];
  const label = item.detail ? `${item.title}. ${item.meta}. ${item.detail}` : `${item.title}. ${item.meta}`;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole='button'
      accessibilityLabel={label}>
      <View style={[styles.iconTile, { backgroundColor: kind.tint }]}>
        <MaterialCommunityIcons name={kind.icon} size={20} color={kind.color} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {item.meta}
        </Text>
      </View>
      <MaterialCommunityIcons name='chevron-right' size={20} color={colors.textMuted} />
      {!isLast ? <View style={styles.divider} /> : null}
    </Pressable>
  );
}

export default React.memo(AgendaRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
  },
  rowPressed: {
    backgroundColor: colors.backgroundLite,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    position: 'absolute',
    left: spacing.lg + 40 + spacing.md,
    right: spacing.lg,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
