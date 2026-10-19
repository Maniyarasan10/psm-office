import React from 'react';
import { Modal as RNModal, View, StyleSheet, TouchableWithoutFeedback, ViewStyle } from 'react-native';
import { colors, radius, shadows } from '../../theme';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
}

const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  children,
  style,
  transparent = true,
  animationType = 'fade',
}) => {
  return (
    <RNModal
      visible={visible}
      transparent={transparent}
      animationType={animationType}
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
            <View style={[styles.content, style]}>{children}</View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    width: '100%',
    maxWidth: 400,
    ...shadows.modal,
  },
});

export default Modal;
export { Modal };

