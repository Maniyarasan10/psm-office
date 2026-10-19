import { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { documentUrl } from '../services/api';

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

export function useDocumentFile(
  documentId: string,
  fileName: string,
  fileType?: string,
  resolveUrl: (id: string) => string = documentUrl
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
      const localUri = `${FileSystem.cacheDirectory}doc-preview-${documentId}${fileType ?? ''}`;
      const result = await FileSystem.downloadAsync(resolveUrl(documentId), localUri);
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
  }, [documentId, fileType, resolveUrl]);

  const saveToDevice = useCallback(async () => {
    if (!documentId) return;
    setSaving(true);
    setError(null);
    try {
      const dir = `${FileSystem.documentDirectory}documents/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
      const localUri = `${dir}${safeFileName(fileName)}`;
      const result = await FileSystem.downloadAsync(resolveUrl(documentId), localUri);
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
  }, [documentId, fileName, resolveUrl]);

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