import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, shadows } from '../../theme';

interface CardProps {
  elevation?: 'subtle' | 'card' | 'elevated';
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: boolean;
}

const Card: React.FC<CardProps> = ({ elevation = 'card', children, style, padding = true }) => {
  return (
    <View
      style={[
        styles.card,
        shadows[elevation],
        { backgroundColor: colors.surface, borderRadius: radius.card },
        padding && styles.padding,
        style,
      ]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
  },
  padding: {
    padding: 16,
  },
});

export default Card;
export { Card };

