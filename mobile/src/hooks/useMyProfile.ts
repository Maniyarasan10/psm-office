import { useCallback, useEffect, useRef, useState } from 'react';
import { DirectoryPerson } from '../types';
import {
  getEmployeeById,
  getInterns,
  RawPersonRecord,
  updatePersonProfile,
  uploadProfilePhoto,
} from '../services/api';
import { toDirectoryPerson } from '../utils/people';

export interface ProfileEditFields {
  name?: string;
  phone?: string;
  email?: string;
  photoUri?: string;
  photoName?: string;
  photoType?: string;
}

export interface ProfileSaveResult {
  ok: boolean;
  message?: string;
  error?: string;
  updated?: DirectoryPerson;
}

export interface MyProfileData {
  profile: DirectoryPerson | null;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  reload: () => void;
  refresh: () => void;
  silentReload: () => void;
  save: (fields: ProfileEditFields) => Promise<ProfileSaveResult>;
}

export function useMyProfile(personType: 'employee' | 'intern', personId: string): MyProfileData {
  const [profile, setProfile] = useState<DirectoryPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const requestId = useRef(0);
  const actionBusyRef = useRef(false);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      try {
        let raw: RawPersonRecord | null = null;
        if (personType === 'intern') {
          const response = await getInterns();
          const rows: RawPersonRecord[] = Array.isArray(response.data) ? response.data : [];
          raw = rows.find(row => row && row._id === personId) ?? null;
        } else {
          const response = await getEmployeeById(personId);
          if (response?.data) {
            raw = response.data as RawPersonRecord;
          }
        }

        if (id !== requestId.current) return;
        if (raw && raw.name) {
          setProfile(toDirectoryPerson(raw, personType));
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (id !== requestId.current) return;
        setError(true);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [personType, personId]
  );

  const reload = useCallback(() => {
    void run('initial');
  }, [run]);

  const refresh = useCallback(() => {
    void run('refresh');
  }, [run]);

  const silentReload = useCallback(() => {
    void run('silent');
  }, [run]);

  useEffect(() => {
    void run('initial');
    return () => {
      requestId.current += 1;
    };
  }, [run]);

  const save = useCallback(
    async (fields: ProfileEditFields): Promise<ProfileSaveResult> => {
      if (actionBusyRef.current) {
        return { ok: false, error: 'Unable to save your changes right now.' };
      }

      actionBusyRef.current = true;
      try {
        let photoPath: string | undefined;
        if (fields.photoUri) {
          const formData = new FormData();
          formData.append(
            'photo',
            {
              uri: fields.photoUri,
              name: fields.photoName ?? 'profile.jpg',
              type: fields.photoType ?? 'image/jpeg',
            } as unknown as Blob
          );
          const photoResponse = await uploadProfilePhoto(formData);
          photoPath = photoResponse?.data?.photo_path;
        }

        const response = await updatePersonProfile(personId, personType, {
          name: fields.name,
          phone: fields.phone,
          email: fields.email,
          photo_path: photoPath,
        });

        if (!response?.data) {
          throw new Error('invalid_response');
        }

        const updated = profile
          ? {
              ...profile,
              name: fields.name ?? profile.name,
              phone: fields.phone ?? profile.phone,
              email: fields.email ?? profile.email,
              photoPath: photoPath ?? profile.photoPath,
            }
          : undefined;

        if (updated) setProfile(updated);

        return { ok: true, message: 'Profile updated successfully.', updated };
      } catch {
        return { ok: false, error: 'Unable to update your profile. Please check your connection and try again.' };
      } finally {
        actionBusyRef.current = false;
      }
    },
    [personId, personType, profile]
  );

  return {
    profile,
    loading,
    refreshing,
    error,
    reload,
    refresh,
    silentReload,
    save,
  };
}