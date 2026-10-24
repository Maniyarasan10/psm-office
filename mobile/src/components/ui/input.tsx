import React from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  disabled?: boolean;
  rightElement?: React.ReactNode;
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  disabled = false,
  rightElement,
  ...rest
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        <TextInput
          {...rest}
          editable={!disabled}
          style={[styles.input, error ? styles.inputError : null, disabled && styles.inputDisabled, rest.style]}
          placeholderTextColor={colors.textMuted}
        />
        {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
  },
  rightElement: {
    marginLeft: spacing.xs,
  },
  inputError: {
    borderColor: colors.error,
  },
  inputDisabled: {
    opacity: 0.5,
    backgroundColor: colors.backgroundLite,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
});

export default Input;
export { Input };

