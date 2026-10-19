import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, StyleProp, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, typography, componentSizes } from '../../theme';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onPress,
  children,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
}) => {
  const variantStyles = {
    primary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    secondary: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    destructive: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
  };

  const textColor = {
    primary: colors.textInverted,
    secondary: colors.textPrimary,
    destructive: colors.textInverted,
    ghost: colors.textPrimary,
  };

  const sizeConfig = componentSizes.button[size];
  const textStyle = size === 'sm' ? typography.caption : size === 'lg' ? typography.subtitle : typography.bodyMedium;

  return (
    <TouchableOpacity
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        {
          height: sizeConfig.height,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          backgroundColor: variantStyles[variant].backgroundColor,
          borderColor: variantStyles[variant].borderColor,
          borderWidth: variant === 'ghost' ? 0 : 1,
        },
        disabled && styles.disabled,
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}>
      {loading ? (
        <ActivityIndicator size='small' color={textColor[variant]} />
      ) : (
        <Text style={[styles.text, { color: textColor[variant], ...textStyle, fontWeight: '600' }]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    minHeight: 44,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    textAlign: 'center',
  },
});

export default Button;
export { Button };

