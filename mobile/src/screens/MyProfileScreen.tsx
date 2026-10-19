import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Linking } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { MoreStackParamList } from '../types';
import { colors, spacing } from '../theme';
import { Header } from '../components/ui/header';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { EmptyState } from '../components/ui/empty-state';
import { ProfileHero, ProfileRow, ProfileSection } from '../components/people/person-profile';
import { useMyProfile } from '../hooks/useMyProfile';
import { formatDate } from '../utils/people';

type MyProfileNav = NativeStackNavigationProp<MoreStackParamList, 'MyProfile'>;

export default function MyProfileScreen() {
  const navigation = useNavigation<MyProfileNav>();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = (employee?.person_type ?? personType) as 'employee' | 'intern';

  const { profile, loading, refreshing, error, reload, refresh, silentReload } = useMyProfile(
    personTypeValue,
    personId
  );

  useFocusEffect(
    useCallback(() => {
      silentReload();
    }, [silentReload])
  );

  const sendEmail = useCallback(() => {
    const email = profile?.email;
    if (!email) return;
    Linking.openURL(`mailto:${email}`);
  }, [profile?.email]);

  const callPhone = useCallback(() => {
    const phone = profile?.phone;
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`);
  }, [profile?.phone]);

  const isIntern = personTypeValue === 'intern';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='My profile'
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
        rightIcon='pencil-outline'
        onRightPress={() => navigation.navigate('EditProfile')}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonLoader height={180} style={styles.skeletonSpacing} />
          <SkeletonLoader height={48} style={styles.skeletonSpacing} />
          <SkeletonLoader height={48} style={styles.skeletonSpacing} />
        </View>
      ) : error && !profile ? (
        <EmptyState
          title='Unable to load your profile'
          subtitle='We could not reach the server. Please check your connection and try again.'
          icon='account-alert-outline'
          actionText='Try again'
          onAction={reload}
        />
      ) : profile ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <ProfileHero person={profile} />

          <ProfileSection title='Work information'>
            <ProfileRow
              label={isIntern ? 'Intern ID' : 'Employee ID'}
              value={profile.idLabel}
              icon='identifier'
            />
            <View style={styles.divider} />
            <ProfileRow label='Department' value={profile.department} icon='office-building-outline' />
            {isIntern ? (
              <>
                <View style={styles.divider} />
                <ProfileRow label='College' value={profile.college} icon='school-outline' />
              </>
            ) : (
              <>
                <View style={styles.divider} />
                <ProfileRow label='Designation' value={profile.designation} icon='badge-account-outline' />
              </>
            )}
            <View style={styles.divider} />
            <ProfileRow
              label='Joined'
              value={formatDate(profile.joiningDate)}
              icon='calendar-clock-outline'
            />
            <View style={styles.divider} />
            <ProfileRow label='Status' value={profile.status} icon='shield-account-outline' />
          </ProfileSection>

          <ProfileSection title='Contact details'>
            {profile.phone ? (
              <ProfileRow
                label='Phone'
                value={profile.phone}
                icon='phone-outline'
                actionable
                onPress={callPhone}
                accessibilityLabel={`Call ${profile.phone}`}
              />
            ) : (
              <ProfileRow label='Phone' value={undefined} icon='phone-outline' />
            )}
            <View style={styles.divider} />
            {profile.email ? (
              <ProfileRow
                label='Email'
                value={profile.email}
                icon='email-outline'
                actionable
                onPress={sendEmail}
                accessibilityLabel={`Email ${profile.email}`}
              />
            ) : (
              <ProfileRow label='Email' value={undefined} icon='email-outline' />
            )}
          </ProfileSection>
        </ScrollView>
      ) : null}
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
  loadingWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  skeletonSpacing: {
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 52,
  },
});