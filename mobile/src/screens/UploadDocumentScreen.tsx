import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { DocumentsStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useDocuments } from '../hooks/useDocuments';
import {
  DOCUMENT_MAX_BYTES,
  defaultSubmissionCategory,
  formatFileSize,
  submissionCategories,
} from '../utils/documents';

type UploadNav = NativeStackNavigationProp<DocumentsStackParamList, 'UploadDocument'>;

interface SelectedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

function fileNameFromUri(uri: string): string {
  return uri.split('/').pop() ?? 'upload';
}

export default function UploadDocumentScreen() {
  const navigation = useNavigation<UploadNav>();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const { submitting, uploadProgress, actionError, submit, silentReload } = useDocuments(
    personId ? { _id: personId, employee_id: employee?.employee_id, name: employee?.name } : null
  );

  const [file, setFile] = useState<SelectedFile | null>(null);
  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState('');
  const [pickerError, setPickerError] = useState<string | null>(null);

  const categories = useMemo(() => submissionCategories(personTypeValue), [personTypeValue]);
  const [category, setCategory] = useState(() => defaultSubmissionCategory(personTypeValue));

  const pickFile = useCallback(async () => {
    setPickerError(null);
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      if (typeof asset.size === 'number' && asset.size > DOCUMENT_MAX_BYTES) {
        setPickerError(`This file is larger than ${formatFileSize(DOCUMENT_MAX_BYTES)}.`);
        return;
      }
      setFile({
        uri: asset.uri,
        name: asset.name ?? fileNameFromUri(asset.uri),
        type: asset.mimeType ?? 'application/octet-stream',
        size: asset.size,
      });
    } catch {
      setPickerError("Couldn't open your file picker right now.");
    } finally {
      setPicking(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    const result = await submit({ file, category });
    if (result.ok) {
      setSubmitted(true);
      setSubmittedMessage(result.message ?? 'Document submitted successfully.');
      void silentReload();
    }
  }, [file, category, submit, silentReload]);

  const reset = useCallback(() => {
    setFile(null);
    setSubmitted(false);
    setSubmittedMessage('');
    setPickerError(null);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Upload document"
        leftIcon="arrow-left"
        onLeftPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {submitted ? (
          <Card style={styles.successCard}>
            <View style={styles.successIcon}>
              <MaterialCommunityIcons name="check" size={32} color={colors.textInverted} />
            </View>
            <Text style={styles.successTitle}>Document submitted</Text>
            <Text style={styles.successSubtitle}>{submittedMessage}</Text>
            <Text style={styles.successNote}>
              The office can review it in the company files section. Review status isn't shown in
              this app yet.
            </Text>
            <Button
              variant="primary"
              size="lg"
              style={styles.successButton}
              onPress={() => navigation.goBack()}
            >
              Done
            </Button>
            <Button variant="ghost" size="md" onPress={reset}>
              Upload another document
            </Button>
          </Card>
        ) : (
          <>
            <Text style={styles.introText}>
              Submit any file (e.g. an ID, certificate, signed form, PDF or document). The file is
              uploaded to the company files library and linked to you.
            </Text>

            <Card style={styles.pickerCard}>
              {file ? (
                <View style={styles.pickedRow}>
                  {file.type.startsWith('image/') ? (
                    <Image source={{ uri: file.uri }} style={styles.thumb} accessibilityLabel="Selected document" />
                  ) : (
                    <View style={styles.thumb}>
                      <MaterialCommunityIcons name="file-outline" size={26} color={colors.primary} />
                    </View>
                  )}
                  <View style={styles.pickedInfo}>
                    <Text style={styles.pickedName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.pickedMeta} numberOfLines={1}>
                      {formatFileSize(file.size)} · {file.type}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.pickEmpty}>
                  <MaterialCommunityIcons name="file-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.pickEmptyText}>No file selected yet</Text>
                </View>
              )}

              <Button
                variant="secondary"
                size="md"
                onPress={pickFile}
                disabled={picking || submitting}
                style={styles.pickButton}
              >
                {picking ? 'Opening files…' : file ? 'Choose another file' : 'Choose a file'}
              </Button>
              {pickerError && <Text style={styles.pickerErrorText}>{pickerError}</Text>}
              {actionError && <Text style={styles.pickerErrorText}>{actionError}</Text>}
            </Card>

            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.categoryChips}>
              {categories.map(item => (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    category === item && styles.categoryChipActive,
                    pressed && styles.chipPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Category ${item}`}
                >
                  <Text style={[styles.categoryChipText, category === item && styles.categoryChipTextActive]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.infoBox}>
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.info} />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>Any file type</Text>
                <Text style={styles.infoSubtitle}>
                  Images, PDFs, Word, Excel and other documents are accepted, up to{' '}
                  {formatFileSize(DOCUMENT_MAX_BYTES)} each.
                </Text>
              </View>
            </View>

            {submitting && (
              <View style={styles.progressWrap}>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>Uploading… {uploadProgress}%</Text>
              </View>
            )}

            <Button
              variant="primary"
              size="lg"
              onPress={handleSubmit}
              disabled={!file || submitting}
              style={styles.submitButton}
            >
              {submitting ? (
                <View style={styles.submitLoading}>
                  <ActivityIndicator size="small" color={colors.textInverted} />
                  <Text style={styles.submitLoadingText}>Submitting…</Text>
                </View>
              ) : (
                'Submit document'
              )}
            </Button>

            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.cancelButton}
              accessibilityRole="button"
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
  introText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  pickerCard: {
    marginTop: spacing.lg,
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  pickedInfo: {
    flex: 1,
  },
  pickedName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pickedMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  pickEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  pickEmptyText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  pickButton: {
    alignSelf: 'stretch',
  },
  pickerErrorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryChipActive: {
    backgroundColor: colors.infoLight,
    borderColor: colors.infoTint,
  },
  chipPressed: {
    opacity: 0.7,
  },
  categoryChipText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.infoTint,
    borderRadius: radius.medium,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  infoTextWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  infoTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  infoSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  progressWrap: {
    marginTop: spacing.xl,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  progressText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: spacing.xl,
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  submitLoadingText: {
    ...typography.bodyMedium,
    color: colors.textInverted,
    fontWeight: '600',
  },
  cancelButton: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  successCard: {
    alignItems: 'center',
    marginTop: spacing['2xl'],
    paddingVertical: spacing['2xl'],
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  successNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 18,
  },
  successButton: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
});