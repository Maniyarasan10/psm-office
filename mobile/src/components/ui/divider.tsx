import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme';

interface DividerProps {
  style?: ViewStyle;
  vertical?: boolean;
  thickness?: number;
  marginVertical?: number;
  marginHorizontal?: number;
}

const Divider: React.FC<DividerProps> = ({
  style,
  vertical = false,
  thickness = 1,
  marginVertical = spacing.md,
  marginHorizontal = 0,
}) => {
  return (
    <View
      style={[
        vertical ? styles.vertical : styles.horizontal,
        {
          backgroundColor: colors.border,
          ...(vertical
            ? { width: thickness, marginHorizontal }
            : { height: thickness, marginVertical }),
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  horizontal: {
    width: '100%',
  },
  vertical: {
    height: '100%',
  },
});

export default Divider;
export { Divider };

