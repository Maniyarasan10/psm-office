import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, radius, iconSizes } from '../../theme';

interface IconButtonProps {
  icon: string;
  size?: keyof typeof iconSizes;
  color?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 'lg',
  color = colors.textPrimary,
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.container, style, disabled && styles.disabled]}
      accessibilityLabel={accessibilityLabel || icon}
      accessibilityRole='button'
      accessibilityState={{ disabled }}>
      <MaterialCommunityIcons name={icon} size={iconSizes[size]} color={color} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
});

export default IconButton;
export { IconButton };

