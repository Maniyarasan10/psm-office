import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, spacing, radius, typography } from '../theme';

interface Props {
  onRetry: () => void;
  errorMessage?: string;
}

export default function CrashFallback({ onRetry, errorMessage }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <MaterialCommunityIcons name='shield-off-outline' size={72} color={colors.warning} />
        <Text style={styles.title}>App Crashed</Text>
        <Text style={styles.subtitle}>
          The app encountered an unexpected error and needs to restart.
        </Text>
        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.button}
          onPress={onRetry}
          accessibilityRole='button'
          accessibilityLabel='Restart app'>
          <Text style={styles.buttonText}>Restart App</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLite,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.errorLight,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.errorTint,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.medium,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    ...typography.bodyMedium,
    color: colors.textInverted,
    fontWeight: '600',
  },
});
export { CrashFallback };

