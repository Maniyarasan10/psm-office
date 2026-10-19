import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin, requestPasswordReset, resetPasswordWithOtp } from '../services/api';
import { apiErrorMessage } from '../utils/apiError';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [userId, setUserId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetId, setResetId] = useState<string>('');
  const [resetOtp, setResetOtp] = useState<string>('');
  const [resetPass, setResetPass] = useState<string>('');
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [resetLoading, setResetLoading] = useState<boolean>(false);

  const openForgot = () => {
    setError('');
    setResetId(userId.trim());
    setResetOtp('');
    setResetPass('');
    setResetStep('request');
    setMode('forgot');
  };

  const backToLogin = () => {
    setError('');
    setUserId(resetId.trim());
    setMode('login');
  };

  const handleLogin = async () => {
    setError('');
    if (!userId.trim() || !password.trim()) {
      setError('Please enter your ID and password');
      return;
    }
    setLoading(true);
    try {
      const res = await apiLogin(userId.trim(), password);
      await login(res.data);
    } catch (err) {
      setError(
        apiErrorMessage(
          'Login failed. Please check your credentials and try again.',
          err
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setError('');
    if (!resetId.trim()) {
      setError('Please enter your employee or intern ID');
      return;
    }
    setResetLoading(true);
    try {
      const res = await requestPasswordReset(resetId.trim());
      setResetStep('verify');
      Alert.alert(
        'Check your email',
        res.data?.message ||
          'If that ID exists, a reset code has been sent to its registered email.'
      );
    } catch (err) {
      setError(
        apiErrorMessage('Could not send the reset code. Please try again.', err)
      );
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    if (!resetOtp.trim() || !resetPass.trim()) {
      setError('Please enter the code from your email and a new password');
      return;
    }
    setResetLoading(true);
    try {
      await resetPasswordWithOtp(resetId.trim(), resetOtp.trim(), resetPass);
      Alert.alert('Password updated', 'You can now sign in with your new password.');
      setUserId(resetId.trim());
      setPassword('');
      setMode('login');
    } catch (err) {
      setError(
        apiErrorMessage('Could not reset your password. Please try again.', err)
      );
    } finally {
      setResetLoading(false);
    }
  };

  if (mode === 'forgot') {
    const busy = resetLoading;
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <Image source={require('../../assets/fin.png')} style={styles.logoImage} resizeMode='contain' />
              <Text style={styles.subtitle}>Office Manager</Text>
            </View>

            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.description}>
              {resetStep === 'request'
                ? 'Enter your employee or intern ID and we will email you a reset code.'
                : 'Enter the code we emailed you and choose a new password.'}
            </Text>

            {error ? (
              <View style={styles.errorContainer} accessibilityRole='alert'>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>User ID</Text>
              <TextInput
                style={styles.input}
                value={resetId}
                onChangeText={text => {
                  setResetId(text);
                  setError('');
                }}
                placeholder='Enter your employee or intern ID'
                placeholderTextColor={colors.textMuted}
                autoCapitalize='none'
                autoCorrect={false}
                editable={!busy && resetStep === 'request'}
                accessibilityLabel='User ID for password reset'
              />
            </View>

            {resetStep === 'verify' ? (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Reset Code</Text>
                  <TextInput
                    style={styles.input}
                    value={resetOtp}
                    onChangeText={text => {
                      setResetOtp(text);
                      setError('');
                    }}
                    placeholder='6-digit code from your email'
                    placeholderTextColor={colors.textMuted}
                    keyboardType='number-pad'
                    maxLength={6}
                    editable={!busy}
                    accessibilityLabel='Reset code'
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>New Password</Text>
                  <TextInput
                    style={styles.input}
                    value={resetPass}
                    onChangeText={text => {
                      setResetPass(text);
                      setError('');
                    }}
                    placeholder='Enter a new password'
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    editable={!busy}
                    accessibilityLabel='New password'
                  />
                </View>
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={resetStep === 'request' ? handleRequestOtp : handleResetPassword}
              disabled={busy}
              accessibilityRole='button'
              accessibilityState={{ disabled: busy, busy }}>
              {busy ? (
                <ActivityIndicator color={colors.textInverted} size='small' />
              ) : (
                <Text style={styles.buttonText}>
                  {resetStep === 'request' ? 'Send Reset Code' : 'Reset Password'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={backToLogin}
              disabled={busy}
              accessibilityRole='button'>
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image source={require('../../assets/fin.png')} style={styles.logoImage} resizeMode='contain' />
            <Text style={styles.subtitle}>Office Manager</Text>
          </View>

          <Text style={styles.title}>Sign In</Text>
          <Text style={styles.description}>Use your employee or intern ID and password</Text>

          {error ? (
            <View style={styles.errorContainer} accessibilityRole='alert'>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>User ID</Text>
            <TextInput
              style={styles.input}
              value={userId}
              onChangeText={text => {
                setUserId(text);
                setError('');
              }}
              placeholder='Enter your employee or intern ID'
              placeholderTextColor={colors.textMuted}
              autoCapitalize='none'
              autoCorrect={false}
              editable={!loading}
              accessibilityLabel='User ID'
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={text => {
                  setPassword(text);
                  setError('');
                }}
                placeholder='Enter your password'
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                editable={!loading}
                accessibilityLabel='Password'
              />
              <TouchableOpacity
                style={styles.visibilityButton}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
                hitSlop={8}
                accessibilityRole='button'
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                <Text style={styles.visibilityText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole='button'
            accessibilityLabel='Sign in'
            accessibilityState={{ disabled: loading, busy: loading }}>
            {loading ? (
              <ActivityIndicator color={colors.textInverted} size='small' />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={openForgot}
            disabled={loading}
            accessibilityRole='button'
            accessibilityLabel='Forgot password'>
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoImage: {
    width: 140,
    height: 140,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  errorContainer: {
    backgroundColor: colors.errorLight,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.errorTint,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 44,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  visibilityButton: {
    position: 'absolute',
    right: spacing.md,
    padding: spacing.xs,
  },
  visibilityText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.medium,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.bodyMedium,
    color: colors.textInverted,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.xs,
  },
  linkText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});

