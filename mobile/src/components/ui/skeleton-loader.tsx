import React from 'react';
import { View, StyleSheet, Dimensions, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = SCREEN_WIDTH - 32,
  height = 16,
  borderRadius = radius.medium,
  style,
}) => {
  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.border,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.border,
  },
});

export default SkeletonLoader;
export { SkeletonLoader };

