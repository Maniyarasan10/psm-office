import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, spacing, radius, typography, shadows } from '../../theme';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose?: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  const typeConfig = {
    success: { icon: 'check-circle', bgColor: colors.successLight, iconColor: colors.success },
    error: { icon: 'alert-circle', bgColor: colors.errorLight, iconColor: colors.error },
    warning: { icon: 'alert', bgColor: colors.warningLight, iconColor: colors.warning },
    info: { icon: 'information', bgColor: colors.infoLight, iconColor: colors.info },
  };

  const config = typeConfig[type];

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor }]}>
      <MaterialCommunityIcons name={config.icon} size={20} color={config.iconColor} />
      <Text style={styles.message}>{message}</Text>
      {onClose && (
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <MaterialCommunityIcons name='close' size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.medium,
    ...shadows.elevated,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    marginLeft: spacing.sm,
  },
  closeButton: {
    padding: spacing.xs,
  },
});

export default Toast;
export { Toast };

