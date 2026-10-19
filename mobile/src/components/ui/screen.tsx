import React from 'react';
import { View, StyleSheet, ViewStyle, SafeAreaView, StatusBar } from 'react-native';
import { spacing, colors } from '../../theme';

interface ScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: boolean;
  safeArea?: boolean;
  statusBarStyle?: 'default' | 'light-content' | 'dark-content';
  backgroundColor?: string;
}

const Screen: React.FC<ScreenProps> = ({
  children,
  style,
  padding = true,
  safeArea = true,
  statusBarStyle = 'dark-content',
  backgroundColor = colors.background,
}) => {
  const Container = safeArea ? SafeAreaView : View;
  return (
    <>
      <StatusBar barStyle={statusBarStyle} backgroundColor={backgroundColor} />
      <Container style={[styles.container, { backgroundColor }, padding && styles.padding, style]}>
        {children}
      </Container>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  padding: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
});

export default Screen;
export { Screen };

