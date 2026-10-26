import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const IS_WEB = Platform.OS === 'web';
const USE_SECURE_STORE = !IS_WEB && typeof SecureStore.getItemAsync === 'function';

/**
 * Secure key-value storage.
 *
 * Native builds use expo-secure-store (iOS Keychain / Android
 * EncryptedSharedPreferences) for session tokens, cached employee data and
 * notification metadata. If SecureStore is unavailable or rejects a write on a
 * native build we deliberately do NOT fall back to AsyncStorage: silently
 * downgrading sensitive data to plaintext is worse than losing the cache.
 *
 * The web build has no SecureStore implementation, so it keeps using
 * AsyncStorage to preserve the existing web session behavior.
 */

export async function secureGetItem(key: string): Promise<string | null> {
  if (USE_SECURE_STORE) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  }
  if (!IS_WEB) return null;
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function secureSetItem(key: string, value: string): Promise<void> {
  if (USE_SECURE_STORE) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  if (!IS_WEB) {
    throw new Error('Secure storage is unavailable on this device');
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // best effort
  }
}

export async function secureDeleteItem(key: string): Promise<void> {
  if (USE_SECURE_STORE) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  }
  // Also remove legacy web/fallback copies.
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function secureMultiDelete(keys: string[]): Promise<void> {
  if (USE_SECURE_STORE) {
    try {
      await Promise.all(keys.map(k => SecureStore.deleteItemAsync(k)));
    } catch {
      // ignore
    }
  }
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}
