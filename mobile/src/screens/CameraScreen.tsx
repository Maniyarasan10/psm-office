import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { confirmAttendance } from '../services/api';
import { reverseGeocode, PlaceDetails } from '../utils/location';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from '../types';
import Button from '../components/ui/button';
import { apiErrorMessage } from '../utils/apiError';
import { colors, spacing, radius, shadows } from '../theme';

type CameraNavProp = NativeStackNavigationProp<RootStackParamList, 'Camera'>;

interface Props {
  navigation: CameraNavProp;
}

export default function CameraScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { employee, personType } = useAuth();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    setLocationError(null);
    setLocation(null);
    setPlaceDetails(null);
    const locStatus = await Location.requestForegroundPermissionsAsync();
    if (!locStatus.granted) {
      setLocationError('Location permission denied');
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setLocation(coords);
      const place = await reverseGeocode(coords.latitude, coords.longitude);
      setPlaceDetails(place);
    } catch (err) {
      setLocationError('Failed to get location');
      console.error(err);
    }
  };

  const confirmAndUpload = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const time = new Date().toTimeString().slice(0, 5);
      const date = new Date().toISOString().split('T')[0];

      const formData = new FormData();
      formData.append('person_id', employee!._id);
      formData.append('person_type', personType);
      formData.append('time', time);
      formData.append('date', date);

      if (location) {
        formData.append('latitude', String(location.latitude));
        formData.append('longitude', String(location.longitude));
      }

      await confirmAttendance(formData);

      const gpsInfo = location ? `\nGPS: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : '';
      Alert.alert(
        'Attendance Confirmed',
        `Clock in recorded at ${time}${gpsInfo}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert(
        'Attendance not confirmed',
        apiErrorMessage('Failed to confirm attendance. Please try again.', err)
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {isFocused && <StatusBar style="dark" />}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mark Attendance</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="map-marker-radius" size={64} color={colors.primary} />
        </View>

        <Text style={styles.title}>Location</Text>
        <Text style={styles.subtitle}>Your current location will be recorded when available. You can check in from anywhere.</Text>

        {location && (
          <View style={styles.locationCard}>
            {placeDetails ? (
              <>
                <View style={styles.placeRow}>
                  <MaterialCommunityIcons name="map-marker" size={16} color={colors.success} />
                  <Text style={styles.placeText} numberOfLines={2}>
                    {placeDetails.formattedAddress}
                  </Text>
                </View>
                <Text style={styles.coordsText}>
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Text>
              </>
            ) : (
              <Text style={styles.coordsText}>
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </Text>
            )}
          </View>
        )}

        {locationError && (
          <View style={styles.errorCard} accessibilityRole="alert">
            <MaterialCommunityIcons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{locationError}</Text>
            <Button
              variant="secondary"
              size="sm"
              onPress={getLocation}
              accessibilityLabel="Retry location"
            >
              Retry
            </Button>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          size="lg"
          style={styles.confirmBtn}
          onPress={confirmAndUpload}
          loading={uploading}
          accessibilityLabel="Confirm attendance"
        >
          <MaterialCommunityIcons name="check-circle" size={20} color={colors.textInverted} />
          {' '}
          Confirm Attendance
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLite,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.large,
    borderBottomRightRadius: radius.large,
    ...shadows.elevated,
  },
  headerSpacer: {
    width: 60,
  },
  cancelBtn: {
    backgroundColor: colors.backgroundLite,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.medium,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    padding: spacing.lg,
    width: '100%',
    ...shadows.card,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  placeText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  coordsText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    borderRadius: radius.medium,
    padding: spacing.lg,
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  footer: {
    padding: spacing.lg,
  },
  confirmBtn: {
    borderRadius: radius.large,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});