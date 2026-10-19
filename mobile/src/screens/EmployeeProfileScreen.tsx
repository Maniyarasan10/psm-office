import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MoreStackParamList } from '../types';
import { colors, spacing } from '../theme';
import { Header } from '../components/ui/header';
import { formatDate } from '../utils/people';
import { ProfileHero, ProfileRow, ProfileSection } from '../components/people/person-profile';

type EmployeeProfileNav = NativeStackNavigationProp<MoreStackParamList, 'EmployeeProfile'>;
type EmployeeProfileRoute = RouteProp<MoreStackParamList, 'EmployeeProfile'>;

export default function EmployeeProfileScreen() {
  const navigation = useNavigation<EmployeeProfileNav>();
  const route = useRoute<EmployeeProfileRoute>();
  const { person } = route.params;

  const sendEmail = useCallback(() => {
    if (!person.email) return;
    Linking.openURL(`mailto:${person.email}`);
  }, [person.email]);

  const isIntern = person.person_type === 'intern';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header title='Profile' leftIcon='arrow-left' onLeftPress={() => navigation.goBack()} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <ProfileHero person={person} />

        <ProfileSection title='Work information'>
          <ProfileRow label={isIntern ? 'Intern ID' : 'Employee ID'} value={person.idLabel} icon='identifier' />
          <View style={styles.divider} />
          <ProfileRow label='Department' value={person.department} icon='office-building-outline' />
          {isIntern ? (
            <>
              <View style={styles.divider} />
              <ProfileRow label='College' value={person.college} icon='school-outline' />
            </>
          ) : (
            <>
              <View style={styles.divider} />
              <ProfileRow label='Designation' value={person.designation} icon='badge-account-outline' />
            </>
          )}
          <View style={styles.divider} />
          <ProfileRow label='Joined' value={formatDate(person.joiningDate)} icon='calendar-clock-outline' />
          <View style={styles.divider} />
          <ProfileRow label='Status' value={person.status} icon='shield-account-outline' />
        </ProfileSection>

        <ProfileSection title='Contact'>
          {person.email ? (
            <ProfileRow
              label='Email'
              value={person.email}
              icon='email-outline'
              actionable
              onPress={sendEmail}
              accessibilityLabel={`Email ${person.name} at ${person.email}`}
            />
          ) : (
            <ProfileRow label='Email' value={undefined} icon='email-outline' />
          )}
        </ProfileSection>

        <Text style={styles.privacyNote}>
          For everyone's privacy, contact details beyond work email are not shared in the directory.
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
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 52,
  },
  privacyNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.lg,
  },
});