import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { DirectoryPerson } from '../../types';
import { colors, spacing, radius, typography } from '../../theme';
import { Avatar } from '../ui/avatar';
import { StatusBadge } from '../ui/status-badge';
import { avatarSource, initialsOf, roleLabel } from '../../utils/people';

export function ProfileHero({ person }: { person: DirectoryPerson }) {
  return (
    <View style={styles.hero}>
      <Avatar source={avatarSource(person.photoPath)} fallbackText={initialsOf(person.name)} size='xl' />
      <Text style={styles.heroName}>{person.name}</Text>
      <Text style={styles.heroRole} numberOfLines={1}>
        {roleLabel(person)}
        {person.department ? ` · ${person.department}` : ''}
      </Text>
      {person.status ? <StatusBadge status={person.status} /> : null}
    </View>
  );
}

export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export function ProfileRow({
  label,
  value,
  icon,
  actionable,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value?: string;
  icon?: string;
  actionable?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const resolved = value || 'Information unavailable';

  if (actionable && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel ?? `${label}: ${resolved}`}>
        {icon ? <MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} /> : null}
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {resolved}
          </Text>
        </View>
        <MaterialCommunityIcons name='chevron-right' size={18} color={colors.textMuted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} /> : null}
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>
          {resolved}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  heroName: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  heroRole: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowTextWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowValue: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
});