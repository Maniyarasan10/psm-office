import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { MoreStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { changePassword } from '../services/api';
import { apiErrorMessage, isStatus } from '../utils/apiError';

type ChangePasswordNav = NativeStackNavigationProp<MoreStackParamList, 'ChangePassword'>;

export default function ChangePasswordScreen() {
  const navigation = useNavigation<ChangePasswordNav>();
  const { employee, personType, logout } = useAuth();
  const employeeId = employee?.employee_id ?? '';
  const personTypeValue = (employee?.person_type ?? personType) as 'employee' | 'intern';

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validate = useCallback((): string | null => {
    if (!current) return 'Enter your current password.';
    if (next.length < 6) return 'New password must be at least 6 characters.';
    if (next !== confirm) return 'New password and confirmation do not match.';
    return null;
  }, [current, next, confirm]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setFormError(null);
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
if (!employeeId) {
      setFormError("Your account details aren't available right now.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(employeeId, personTypeValue, current, next);
      setSuccess(true);
    } catch (err) {
      if (isStatus(err, 401)) {
        setFormError('Your current password is incorrect.');
      } else {
        setFormError(
          apiErrorMessage(
            'Unable to change your password right now. Please try again.',
            err
          )
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [validate, employeeId, personTypeValue, current, next, submitting]);

  const handleDone = useCallback(async () => {
    try {
      await logout();
    } catch {
      navigation.goBack();
    }
  }, [logout, navigation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='Change password'
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'>
        {success ? (
          <Card style={styles.successCard}>
            <View style={styles.successIcon}>
              <MaterialCommunityIcons name='check' size={32} color={colors.textInverted} />
            </View>
            <Text style={styles.successTitle}>Password changed</Text>
            <Text style={styles.successSubtitle}>
              You'll be signed out so you can sign back in with your new password.
            </Text>
            <Button variant='primary' size='lg' onPress={handleDone} style={styles.successButton}>
              Sign in again
            </Button>
          </Card>
        ) : (
          <>
            <Text style={styles.introText}>
              Choose a password that's at least 6 characters and not used for other accounts. You'll
              use it every time you sign in.
            </Text>

            <Card style={styles.formCard}>
              <Input
                label='Current password'
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                autoCapitalize='none'
                placeholder='Your current password'
              />
              <Input
                label='New password'
                value={next}
                onChangeText={setNext}
                secureTextEntry
                autoCapitalize='none'
                placeholder='At least 6 characters'
              />
              <Input
                label='Confirm new password'
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize='none'
                placeholder='Re-enter your new password'
                containerStyle={styles.lastInput}
              />

              {formError && (
                <View style={styles.formErrorBox}>
                  <MaterialCommunityIcons name='alert-circle-outline' size={18} color={colors.error} />
                  <Text style={styles.formErrorText}>{formError}</Text>
                </View>
              )}

              <Button
                variant='primary'
                size='lg'
                onPress={handleSubmit}
                disabled={submitting}
                style={styles.submitButton}>
                {submitting ? (
                  <View style={styles.submitLoading}>
                    <ActivityIndicator size='small' color={colors.textInverted} />
                    <Text style={styles.submitLoadingText}>Saving…</Text>
                  </View>
                ) : (
                  'Update password'
                )}
              </Button>
            </Card>

            <Text style={styles.lockHint}>
              If you forget your password, contact the office to have it reset.
            </Text>
          </>
        )}
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
  introText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  formCard: {
    marginTop: spacing.lg,
  },
  lastInput: {
    marginBottom: spacing.xs,
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  formErrorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
    marginLeft: spacing.sm,
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  submitLoadingText: {
    ...typography.bodyMedium,
    color: colors.textInverted,
    fontWeight: '600',
  },
  lockHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    lineHeight: 18,
  },
  successCard: {
    alignItems: 'center',
    marginTop: spacing['2xl'],
    paddingVertical: spacing['2xl'],
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  successButton: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
});