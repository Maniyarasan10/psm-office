// Optional build-time overrides (inlined by Expo from the EXPO_PUBLIC_* env
// vars) so the backend URL and Expo project id can differ per build channel
// without editing this file. No production fallback is embedded in source.
const ENV_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const ENV_EXPO_PROJECT_ID = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;

if (!ENV_API_BASE_URL) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL must be set at build time (EAS secret or .env)');
}

export const ENV = {
  API_BASE_URL: ENV_API_BASE_URL,

  EXPO_PROJECT_ID: ENV_EXPO_PROJECT_ID,

  APP_VERSION: '1.0.0',

  IS_DEV: __DEV__,

  // Feature flags
  ENABLE_PUSH_NOTIFICATIONS: true,
  ENABLE_CAMERA: true,
  ENABLE_LOCATION: true,

  // Timeouts
  API_TIMEOUT: 30000,
  LOCATION_TIMEOUT: 15000,

  // Analytics (add your keys)
  // GOOGLE_ANALYTICS_ID: '',
  // AMPLITUDE_API_KEY: '',
};

export default ENV;
