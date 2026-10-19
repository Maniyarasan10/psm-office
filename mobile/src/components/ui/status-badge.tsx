import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

interface StatusBadgeProps {
  status: string;
  /** Optional friendly label; defaults to the status with underscores spaced. */
  label?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const statusLower = (status ?? '').toLowerCase().replace(/_/g, ' ');
const statusStyles: Record<string, { backgroundColor: string; color: string }> = {
    present: { backgroundColor: colors.successLight, color: colors.success },
    absent: { backgroundColor: colors.errorLight, color: colors.error },
    late: { backgroundColor: colors.warningLight, color: colors.warning },
    remote: { backgroundColor: colors.infoLight, color: colors.info },
    office: { backgroundColor: colors.primaryTint + '40', color: colors.primary },
    approved: { backgroundColor: colors.successLight, color: colors.success },
    pending: { backgroundColor: colors.warningLight, color: colors.warning },
    rejected: { backgroundColor: colors.errorLight, color: colors.error },
    completed: { backgroundColor: colors.successLight, color: colors.success },
    'in progress': { backgroundColor: colors.infoLight, color: colors.info },
    'on leave': { backgroundColor: colors.warningLight, color: colors.warning },
    working: { backgroundColor: colors.infoLight, color: colors.info },
    'checked out': { backgroundColor: colors.successLight, color: colors.success },
    'not checked in': { backgroundColor: colors.backgroundLite, color: colors.textSecondary },
    open: { backgroundColor: colors.infoLight, color: colors.info },
    waiting: { backgroundColor: colors.warningLight, color: colors.warning },
    resolved: { backgroundColor: colors.successLight, color: colors.success },
    cancelled: { backgroundColor: colors.backgroundLite, color: colors.textSecondary },
    closed: { backgroundColor: colors.backgroundLite, color: colors.textSecondary },
  };

  const baseStyle = statusStyles[statusLower] || statusStyles.present;
  const display = label ?? (status ?? '').replace(/_/g, ' ');

  return (
    <View style={[styles.container, { backgroundColor: baseStyle.backgroundColor }]}>
      <Text style={[styles.text, { color: baseStyle.color }]}>{display}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});

export default StatusBadge;
export { StatusBadge };

