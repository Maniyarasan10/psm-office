import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

interface BadgeProps {
  label: string | number;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  style?: ViewStyle;
}

const Badge: React.FC<BadgeProps> = ({ label, variant = 'primary', style }) => {
  const variantStyles = {
    primary: { backgroundColor: colors.primary, color: colors.textInverted },
    secondary: { backgroundColor: colors.backgroundLite, color: colors.textPrimary },
    success: { backgroundColor: colors.success, color: colors.textInverted },
    warning: { backgroundColor: colors.warning, color: colors.textInverted },
    error: { backgroundColor: colors.error, color: colors.textInverted },
    info: { backgroundColor: colors.info, color: colors.textInverted },
  };

  const textColor = variantStyles[variant].color;
  const bgColor = variantStyles[variant].backgroundColor;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }, style]}>
      <Text style={[styles.text, { color: textColor }]}>{String(label)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    minHeight: 20,
  },
  text: {
    ...typography.caption,
    fontWeight: '600',
  },
});

export default Badge;
export { Badge };

