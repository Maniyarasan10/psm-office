import axios from 'axios';

const OFFLINE_MESSAGE = "You're offline. Check your internet connection and try again.";
const TIMEOUT_MESSAGE = 'The request timed out. Please try again.';

/**
 * Returns a user-facing connectivity message when the request never reached the
 * server (offline / DNS / timeout), otherwise null so callers can fall back to
 * the backend's own message.
 */
export function connectivityErrorMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error) || error.response) return null;
  return error.code === 'ECONNABORTED' ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE;
}

/** Pulls the backend's own error message so the UI never invents one. */
export function serverErrorMessage(fallback: string, error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as { error?: unknown } | undefined;
    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  }
  return fallback;
}

/** Connectivity first, then the backend's message, then the caller's fallback. */
export function apiErrorMessage(fallback: string, error: unknown): string {
  return connectivityErrorMessage(error) ?? serverErrorMessage(fallback, error);
}

/** True when the request failed with a specific HTTP status code. */
export function isStatus(error: unknown, code: number): boolean {
  return axios.isAxiosError(error) && error.response?.status === code;
}
