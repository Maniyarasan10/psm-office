import React from 'react';
import { View, Image, Text, StyleSheet, ImageSourcePropType } from 'react-native';
import { colors, componentSizes, radius, typography } from '../../theme';

interface AvatarProps {
  source?: ImageSourcePropType;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackText?: string;
}

const Avatar: React.FC<AvatarProps> = ({ source, size = 'md', fallbackText = '?' }) => {
  const sizeNumber = componentSizes.avatar[size];

  return (
    <View style={[styles.container, { width: sizeNumber, height: sizeNumber }]}>
      {source ? (
        <Image source={source} style={styles.image} resizeMode='cover' />
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>{fallbackText?.[0]?.toUpperCase() || '?'}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.pill,
    backgroundColor: colors.avatarBackground,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    color: colors.primary,
    ...typography.subtitle,
    fontWeight: '600',
  },
});

export default Avatar;
export { Avatar };

