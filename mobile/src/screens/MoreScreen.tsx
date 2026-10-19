import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { MoreStackParamList, RootStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { useBackButton } from '../hooks/useBackButton';
import { Avatar } from '../components/ui/avatar';
import { avatarSource, initialsOf, roleLabel } from '../utils/people';

type MoreNav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

export function MenuRow({
  icon,
  label,
  subtitle,
  onPress,
  tint,
  iconColor = colors.primary,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  tint: string;
  iconColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole='button'
      accessibilityLabel={label}>
      <View style={[styles.rowIcon, { backgroundColor: tint }]}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <MaterialCommunityIcons name='chevron-right' size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const navigation = useNavigation<MoreNav>();
  const goBack = useBackButton();
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const { employee } = useAuth();
  const employmentName = employee?.name || 'Team member';
  const summarySubtitle = employee?.designation || employee?.department || 'Employee';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header title='More' leftIcon='arrow-left' onLeftPress={goBack} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => navigation.navigate('MyProfile')}
          style={({ pressed }) => [styles.profileCard, pressed && styles.rowPressed]}
          accessibilityRole='button'
          accessibilityLabel='View my profile'>
          <Avatar
            source={avatarSource(employee?.photo_path)}
            fallbackText={initialsOf(employee?.name)}
            size='lg'
          />
          <View style={styles.profileTextWrap}>
            <Text style={styles.profileName} numberOfLines={1}>
              {employmentName}
            </Text>
            <Text style={styles.profileSubtitle} numberOfLines={1}>
              {summarySubtitle}
            </Text>
          </View>
          <MaterialCommunityIcons name='chevron-right' size={22} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionLabel}>Work</Text>
        <View style={styles.menuCard}>
          <MenuRow
            icon='clipboard-text-check-outline'
            label='Your work summary'
            subtitle='Tasks, attendance and time off at a glance'
            tint={colors.primaryTint}
            onPress={() => rootNavigation?.navigate('WorkSummary')}
          />
        </View>

        <Text style={styles.sectionLabel}>People</Text>
        <View style={styles.menuCard}>
          <MenuRow
            icon='account-search-outline'
            label='Directory'
            subtitle='Find a colleague by name or department'
            tint={colors.infoLight}
            iconColor={colors.info}
            onPress={() => navigation.navigate('Directory')}
          />
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.menuCard}>
          <MenuRow
            icon='account-circle-outline'
            label='My profile'
            subtitle='Review and update your information'
            tint={colors.successLight}
            iconColor={colors.success}
            onPress={() => navigation.navigate('MyProfile')}
          />
          <View style={styles.rowDivider} />
          <MenuRow
            icon='cog-outline'
            label='Settings'
            subtitle='Security and app preferences'
            tint={colors.backgroundLite}
            iconColor={colors.textSecondary}
            onPress={() => navigation.navigate('Settings')}
          />
        </View>

        <Text style={styles.footerNote}>
          Your profile is visible to colleagues through the directory. Phone numbers and personal
          details stay visible only to you.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
    paddingBottom: spacing['3xl'],
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  profileTextWrap: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  profileName: {
    ...typography.title,
    color: colors.textPrimary,
  },
  profileSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    minHeight: 64,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 72,
  },
  footerNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xl,
    lineHeight: 18,
  },
});