import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { MoreStackParamList, Employee } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { useMyProfile } from '../hooks/useMyProfile';
import { avatarSource, initialsOf } from '../utils/people';
import { apiErrorMessage } from '../utils/apiError';

type EditProfileNav = NativeStackNavigationProp<MoreStackParamList, 'EditProfile'>;

interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

function toEmployee(person: {
  _id: string;
  idLabel?: string;
  name: string;
  department?: string;
  designation?: string;
  status?: string;
  email?: string;
  phone?: string;
  photoPath?: string;
  person_type: 'employee' | 'intern';
}): Employee {
  return {
    _id: person._id,
    employee_id: person.idLabel ?? '',
    name: person.name,
    department: person.department,
    designation: person.designation,
    status: (person.status as Employee['status']) ?? 'Active',
    email: person.email,
    phone: person.phone,
    photo_path: person.photoPath,
    person_type: person.person_type,
  };
}

export default function EditProfileScreen() {
  const navigation = useNavigation<EditProfileNav>();
  const { employee, personType, login } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = (employee?.person_type ?? personType) as 'employee' | 'intern';

  const { profile, loading, error, reload, save } = useMyProfile(personTypeValue, personId);

  const [name, setName] = useState(employee?.name ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setPhone(profile.phone ?? '');
      setEmail(profile.email ?? '');
    }
  }, [profile]);

  const pickPhoto = useCallback(async () => {
    setPicking(true);
    setFormError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const mime = asset.mimeType ?? 'image/jpeg';
      if (!mime.startsWith('image/')) return;
      const segment = asset.uri.split('/').pop() ?? 'profile.jpg';
      setPhoto({ uri: asset.uri, name: segment.includes('.') ? segment : 'profile.jpg', type: mime });
    } catch {
      setFormError('Could not open your photo library right now. Please try again.');
    } finally {
      setPicking(false);
    }
  }, []);

  const previewUri = useMemo(() => photo?.uri ?? avatarSource(profile?.photoPath)?.uri, [photo, profile]);

  const validate = useCallback((): string | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return 'Please enter your name.';
    if (phone.trim() && !/^[0-9+()\-.\s]{7,}$/.test(phone.trim())) {
      return 'Enter a valid phone number.';
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return 'Enter a valid email address.';
    }
    return null;
  }, [name, phone, email]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const result = await save({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        photoUri: photo?.uri,
        photoName: photo?.name,
        photoType: photo?.type,
      });
      if (!result.ok) {
        setFormError(result.error ?? 'Unable to update your profile.');
        return;
      }
      if (result.updated) {
        await login(toEmployee(result.updated));
      }
      navigation.goBack();
    } catch (err) {
      setFormError(apiErrorMessage('Something went wrong while saving. Please try again.', err));
    } finally {
      setSaving(false);
    }
  }, [validate, save, name, phone, email, photo, login, navigation, saving]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='Edit profile'
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonLoader height={160} style={styles.skeletonSpacing} />
          <SkeletonLoader height={48} style={styles.skeletonSpacing} />
          <SkeletonLoader height={48} style={styles.skeletonSpacing} />
        </View>
      ) : error && !profile ? (
        <View style={styles.errorWrap}>
          <Card elevation='card'>
            <View style={styles.errorCard}>
              <MaterialCommunityIcons name='alert-circle-outline' size={22} color={colors.error} />
              <Text style={styles.errorText}>Unable to load your profile.</Text>
            </View>
            <Button variant='secondary' size='sm' onPress={reload} style={styles.retryButton}>
              Retry
            </Button>
          </Card>
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps='handled'>
          <Card style={styles.photoCard}>
            <Avatar
              source={previewUri ? { uri: previewUri } : undefined}
              fallbackText={initialsOf(name || employee?.name)}
              size='xl'
            />
            <Button
              variant='secondary'
              size='sm'
              onPress={pickPhoto}
              disabled={picking || saving}
              style={styles.photoButton}>
              {picking ? 'Opening library…' : photo ? 'Change photo' : 'Choose photo'}
            </Button>
            <Text style={styles.photoHint}>A square photo looks best. It appears in the directory.</Text>
          </Card>

          <Input label='Name' value={name} onChangeText={setName} placeholder='Your full name' autoCapitalize='words' />
          <Input
            label='Phone'
            value={phone}
            onChangeText={setPhone}
            placeholder='Mobile number (optional)'
            keyboardType='phone-pad'
          />
          <Input
            label='Email'
            value={email}
            onChangeText={setEmail}
            placeholder='Work email address'
            keyboardType='email-address'
            autoCapitalize='none'
          />

          {formError && (
            <View style={styles.formErrorBox}>
              <MaterialCommunityIcons name='alert-circle-outline' size={18} color={colors.error} />
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          <Button variant='primary' size='lg' onPress={handleSave} disabled={saving} style={styles.saveButton}>
            {saving ? (
              <View style={styles.saveLoading}>
                <ActivityIndicator size='small' color={colors.textInverted} />
                <Text style={styles.saveLoadingText}>Saving…</Text>
              </View>
            ) : (
              'Save changes'
            )}
          </Button>

          <Text style={styles.lockHint}>
            Your employee ID, department and joining date are managed by the office and can't be
            edited here.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  loadingWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  skeletonSpacing: {
    marginBottom: spacing.sm,
  },
  errorWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
    marginLeft: spacing.sm,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  photoCard: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  photoButton: {
    marginTop: spacing.lg,
  },
  photoHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  formErrorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
    marginLeft: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.lg,
  },
  saveLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  saveLoadingText: {
    ...typography.bodyMedium,
    color: colors.textInverted,
    fontWeight: '600',
  },
  lockHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});