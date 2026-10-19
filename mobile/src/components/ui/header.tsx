import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, spacing, typography, radius } from '../../theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: string;
  onLeftPress?: () => void;
  leftAccessibilityLabel?: string;
  rightIcon?: string;
  onRightPress?: () => void;
  rightAccessibilityLabel?: string;
  style?: ViewStyle;
  showShadow?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  leftIcon,
  onLeftPress,
  leftAccessibilityLabel = 'Go back',
  rightIcon,
  onRightPress,
  rightAccessibilityLabel = 'More options',
  style,
  showShadow = false,
}) => {
  return (
    <View style={[styles.container, showShadow && styles.shadow, style]}>
      {leftIcon && onLeftPress ? (
        <TouchableOpacity
          onPress={onLeftPress}
          style={styles.iconButton}
          accessibilityLabel={leftAccessibilityLabel}
          accessibilityRole='button'
          hitSlop={6}>
          <MaterialCommunityIcons name={leftIcon} size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconButton} />
      )}

      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {rightIcon && onRightPress ? (
        <TouchableOpacity
          onPress={onRightPress}
          style={styles.iconButton}
          accessibilityLabel={rightAccessibilityLabel}
          accessibilityRole='button'
          hitSlop={6}>
          <MaterialCommunityIcons name={rightIcon} size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  shadow: {
    shadowColor: '#1c1917',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'left',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'left',
    marginTop: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Header;
export { Header };
