import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { API_HOST, documentUrl, getAuthToken } from '../services/api';

export interface DocumentFileData {
  previewUri: string | null;
  downloading: boolean;
  saving: boolean;
  savedPath: string | null;
  error: string | null;
  downloadPreview: () => Promise<void>;
  saveToDevice: () => Promise<void>;
}

const PREVIEWABLE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export function isPreviewableImage(fileType?: string): boolean {
  const normalized = (fileType ?? '').toLowerCase();
  if (PREVIEWABLE_TYPES.has(normalized)) return true;
  return normalized === '.heic' || normalized === '.heif';
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || `document-${Date.now()}`;
}

/**
 * Authenticated downloads only add the bearer token for URLs that point at our
 * own API. Signed CDN URLs must be fetched without it so the token never leaks
 * to a third-party host.
 */
async function authHeadersFor(url: string): Promise<Record<string, string> | undefined> {
  const isOwnHost = (!!API_HOST && url.startsWith(API_HOST)) || url.startsWith('/');
  if (!isOwnHost) return undefined;
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export function useDocumentFile(
  documentId: string,
  fileName: string,
  fileType?: string,
  resolveUrl: (id: string) => string = documentUrl,
  directUrl?: string | null
): DocumentFileData {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadPreview = useCallback(async () => {
    if (!documentId) return;
    setDownloading(true);
    setError(null);
    try {
      const url = directUrl || resolveUrl(documentId);
      const headers = await authHeadersFor(url);
      const localUri = `${FileSystem.cacheDirectory}doc-preview-${documentId}${fileType ?? ''}`;
      const result = await FileSystem.downloadAsync(url, localUri, headers ? { headers } : undefined);
      if (result.status >= 200 && result.status < 300) {
        setPreviewUri(result.uri);
      } else {
        setError("This file couldn't be previewed right now.");
      }
    } catch {
      setError("This file couldn't be previewed right now.");
    } finally {
      setDownloading(false);
    }
  }, [documentId, fileType, resolveUrl, directUrl]);

  const saveToDevice = useCallback(async () => {
    if (!documentId) return;
    setSaving(true);
    setError(null);
    try {
      const url = directUrl || resolveUrl(documentId);
      const headers = await authHeadersFor(url);
      const dir = `${FileSystem.documentDirectory}documents/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
      const localUri = `${dir}${safeFileName(fileName)}`;
      const result = await FileSystem.downloadAsync(url, localUri, headers ? { headers } : undefined);
      if (result.status >= 200 && result.status < 300) {
        setSavedPath(result.uri);
      } else {
        setError("This file couldn't be saved right now.");
      }
    } catch {
      setError("This file couldn't be saved right now.");
    } finally {
      setSaving(false);
    }
  }, [documentId, fileName, resolveUrl, directUrl]);

  return {
    previewUri,
    downloading,
    saving,
    savedPath,
    error,
    downloadPreview,
    saveToDevice,
  };
}