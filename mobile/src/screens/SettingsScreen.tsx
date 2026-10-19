import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { MoreStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Modal } from '../components/ui/modal';
import { Button } from '../components/ui/button';
import { getSettings } from '../services/api';

type SettingsNav = NativeStackNavigationProp<MoreStackParamList, 'Settings'>;

function MenuRow({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole='button'
      accessibilityLabel={label}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.textSecondary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <MaterialCommunityIcons name='chevron-right' size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<SettingsNav>();
  const { employee, logout } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [mission, setMission] = useState('');
  const [vision, setVision] = useState('');

  useEffect(() => {
    let active = true;
    getSettings()
      .then(response => {
        const data = response?.data ?? {};
        if (!active) return;
        if (data.company_name) setCompanyName(data.company_name);
        if (typeof data.mission === 'string') setMission(data.mission.trim());
        if (typeof data.vision === 'string') setVision(data.vision.trim());
      })
      .catch(() => {
        // Company information is optional decoration; a failure is not surfaced.
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      setShowLogout(false);
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, logout]);

  const appName = 'Office Companion';
  const isIntern = employee?.person_type === 'intern';
  const mentorRole = [employee?.mentor_designation, employee?.mentor_department].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header title='Settings' leftIcon='arrow-left' onLeftPress={() => navigation.goBack()} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.menuCard}>
          <MenuRow
            icon='lock-outline'
            label='Change password'
            subtitle='Update the password you use to sign in'
            onPress={() => navigation.navigate('ChangePassword')}
          />
        </View>

        {isIntern && employee?.mentor_name ? (
          <>
            <Text style={styles.sectionLabel}>Mentor</Text>
            <View style={styles.menuCard}>
              <View style={styles.aboutRow}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name='account-tie-outline' size={22} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{employee.mentor_name}</Text>
                  <Text style={styles.rowSubtitle}>{mentorRole || 'Your mentor'}</Text>
                </View>
              </View>
              {employee.mentor_email ? (
                <>
                  <View style={styles.rowDivider} />
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${employee.mentor_email}`)}
                    style={({ pressed }) => [styles.aboutRow, pressed && styles.rowPressed]}
                    accessibilityRole='button'
                    accessibilityLabel={`Email mentor at ${employee.mentor_email}`}>
                    <View style={styles.rowIcon}>
                      <MaterialCommunityIcons name='email-outline' size={22} color={colors.primary} />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Email</Text>
                      <Text style={styles.rowSubtitle}>{employee.mentor_email}</Text>
                    </View>
                    <MaterialCommunityIcons name='chevron-right' size={20} color={colors.textMuted} />
                  </Pressable>
                </>
              ) : null}
              {employee.mentor_phone ? (
                <>
                  <View style={styles.rowDivider} />
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${employee.mentor_phone}`)}
                    style={({ pressed }) => [styles.aboutRow, pressed && styles.rowPressed]}
                    accessibilityRole='button'
                    accessibilityLabel={`Call mentor at ${employee.mentor_phone}`}>
                    <View style={styles.rowIcon}>
                      <MaterialCommunityIcons name='phone-outline' size={22} color={colors.primary} />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Phone</Text>
                      <Text style={styles.rowSubtitle}>{employee.mentor_phone}</Text>
                    </View>
                    <MaterialCommunityIcons name='chevron-right' size={20} color={colors.textMuted} />
                  </Pressable>
                </>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.menuCard}>
          <View style={styles.aboutRow}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name='office-building-outline' size={22} color={colors.primary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Company</Text>
              <Text style={styles.rowSubtitle}>{companyName || 'Information unavailable'}</Text>
            </View>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.aboutRow}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name='cellphone' size={22} color={colors.primary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowSubtitle}>1.0.0 · {appName}</Text>
            </View>
          </View>
        </View>

        {(mission || vision) && (
          <View style={[styles.menuCard, styles.missionCard]}>
            {mission ? (
              <View style={styles.missionBlock}>
                <View style={styles.missionHeader}>
                  <MaterialCommunityIcons name='target' size={18} color={colors.primary} />
                  <Text style={styles.missionTitle}>Our Mission</Text>
                </View>
                <Text style={styles.missionText}>{mission}</Text>
              </View>
            ) : null}
            {mission && vision ? <View style={styles.missionDivider} /> : null}
            {vision ? (
              <View style={styles.missionBlock}>
                <View style={styles.missionHeader}>
                  <MaterialCommunityIcons name='eye-outline' size={18} color={colors.primary} />
                  <Text style={styles.missionTitle}>Our Vision</Text>
                </View>
                <Text style={styles.missionText}>{vision}</Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={styles.sectionLabel}>Session</Text>
        <View style={styles.menuCard}>
          <Pressable
            onPress={() => setShowLogout(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole='button'
            accessibilityLabel='Log out'>
            <View style={[styles.rowIcon, styles.logoutIcon]}>
              <MaterialCommunityIcons name='logout' size={22} color={colors.error} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, styles.logoutLabel]}>Log out</Text>
              <Text style={styles.rowSubtitle}>Sign out of this device</Text>
            </View>
          </Pressable>
        </View>

        <Text style={styles.footerNote}>
          You're signed in as {employee?.name || 'a team member'}. Your profile and directory data
          are stored on your device only while you're signed in.
        </Text>
      </ScrollView>

      <Modal visible={showLogout} onClose={() => setShowLogout(false)}>
        <View style={styles.modalContent}>
          <View style={styles.modalIcon}>
            <MaterialCommunityIcons name='logout' size={28} color={colors.error} />
          </View>
          <Text style={styles.modalTitle}>Log out of {appName}?</Text>
          <Text style={styles.modalMessage}>
            You'll need your password to sign back in. Your attendance history and documents stay
            saved on the office side.
          </Text>
          <Button
            variant='destructive'
            size='lg'
            onPress={handleLogout}
            loading={loggingOut}
            style={styles.modalButton}>
            Log out
          </Button>
          <Button
            variant='ghost'
            size='md'
            onPress={() => setShowLogout(false)}
            disabled={loggingOut}
            style={styles.modalCancel}>
            Cancel
          </Button>
        </View>
      </Modal>
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
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    minHeight: 64,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  logoutIcon: {
    backgroundColor: colors.errorLight,
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
  logoutLabel: {
    color: colors.error,
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
  missionCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  missionBlock: {
    gap: spacing.sm,
  },
  missionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  missionTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  missionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  missionDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.lg,
  },
  footerNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xl,
    lineHeight: 18,
  },
  modalContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  modalMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  modalButton: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
  modalCancel: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});