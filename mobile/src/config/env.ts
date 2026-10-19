// Development backend (ngrok tunnel; rotates whenever the tunnel restarts).
const DEV_API_URL = 'https://popular-dashing-mastiff.ngrok-free.app/api';
// Production backend.
const PROD_API_URL = 'https://api.problemsolvingmind.com/api';

// Optional build-time overrides (inlined by Expo from the EXPO_PUBLIC_* env
// vars) so the backend URL and Expo project id can differ per build channel
// without editing this file.
const ENV_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const ENV_EXPO_PROJECT_ID = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;

export const ENV = {
  API_BASE_URL: ENV_API_BASE_URL || (__DEV__ ? DEV_API_URL : PROD_API_URL),

  EXPO_PROJECT_ID: ENV_EXPO_PROJECT_ID || '40620a7a-4431-4f25-a378-a527383eabb6',

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
