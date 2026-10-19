import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { SupportPriority, SupportStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { useCreateSupportRequest, SupportDraftFile } from '../hooks/useSupportTicket';
import type { SupportScope } from '../hooks/useSupport';
import {
  DESCRIPTION_MAX_LENGTH,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  SUBJECT_MAX_LENGTH,
} from '../utils/support';
import { formatFileSize } from '../utils/documents';

type NewRequestNav = NativeStackNavigationProp<SupportStackParamList, 'NewRequest'>;

interface SuccessState {
  ticketId: string | null;
}

const PRIORITIES: { value: SupportPriority; label: string; hint: string }[] = [
  { value: 'low', label: 'Low', hint: 'No impact on my work - can wait.' },
  { value: 'medium', label: 'Medium', hint: 'Normal handling.' },
  { value: 'high', label: 'High', hint: 'Blocking my work right now.' },
];

function fileNameFromUri(uri: string): string {
  const segment = uri.split('/').pop() ?? 'upload';
  return segment.includes('.') ? segment : `${segment}.jpg`;
}

export default function NewRequestScreen() {
  const navigation = useNavigation<NewRequestNav>();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const scope = useMemo<SupportScope | null>(
    () =>
      personId
        ? { personId, personType: personTypeValue, authorName: employee?.name ?? '' }
        : null,
    [personId, personTypeValue, employee?.name]
  );

  const {
    categories,
    categoriesLoading,
    categoriesError,
    submitting,
    uploadProgress,
    fieldErrors,
    actionError,
    retryCategories,
    clearFieldError,
    submit,
  } = useCreateSupportRequest(scope);

  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<SupportPriority>('medium');
  const [files, setFiles] = useState<SupportDraftFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  useEffect(() => {
    if (!category && categories.length > 0) {
      setCategory(categories[0]);
      clearFieldError('category');
    }
  }, [categories, category, clearFieldError]);

  const pickImages = useCallback(async () => {
    setPickerError(null);
    const remaining = MAX_ATTACHMENTS - files.length;
    if (remaining <= 0) return;

    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;

      const accepted: SupportDraftFile[] = [...files];
      for (const asset of result.assets ?? []) {
        const mime = asset.mimeType ?? 'image/jpeg';
        if (!mime.startsWith('image/')) {
          setPickerError('Only image files can be attached from this device.');
          continue;
        }
        if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_ATTACHMENT_BYTES) {
          setPickerError(`Each photo must be smaller than ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`);
          continue;
        }
        if (accepted.length >= MAX_ATTACHMENTS) break;
        accepted.push({
          uri: asset.uri,
          name: asset.fileName ?? fileNameFromUri(asset.uri),
          type: mime,
          size: asset.fileSize,
        });
      }
      setFiles(accepted);
    } catch {
      setPickerError("Couldn't open your photo library right now.");
    } finally {
      setPicking(false);
    }
  }, [files]);

  const removeFile = useCallback((uri: string) => {
    setFiles(prev => prev.filter(file => file.uri !== uri));
    setPickerError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const result = await submit({ category, subject, description, priority, files });
    if (result.ok) {
      setSuccess({ ticketId: result.ticketId ?? null });
    }
  }, [category, subject, description, priority, files, submit]);

  const reset = useCallback(() => {
    setCategory(categories[0] ?? '');
    setSubject('');
    setDescription('');
    setPriority('medium');
    setFiles([]);
    setPickerError(null);
    setSuccess(null);
  }, [categories]);

  const priorityHint = PRIORITIES.find(item => item.value === priority)?.hint;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header title="New request" leftIcon="arrow-left" onLeftPress={() => navigation.goBack()} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {success ? (
          <Card style={styles.successCard}>
            <View style={styles.successIcon}>
              <MaterialCommunityIcons name="check" size={32} color={colors.textInverted} />
            </View>
            <Text style={styles.successTitle}>Request submitted</Text>
            <Text style={styles.successSubtitle}>
              The support team has received your request. You will see every reply on the request
              page.
            </Text>
            {success.ticketId ? (
              <Button
                variant="primary"
                size="lg"
                style={styles.successButton}
                onPress={() => {
                  const ticketId = success.ticketId;
                  if (ticketId) navigation.navigate('RequestDetail', { ticketId });
                }}
              >
                View request
              </Button>
            ) : null}
            <Button variant="secondary" size="md" onPress={() => navigation.goBack()}>
              Back to help desk
            </Button>
            <Button variant="ghost" size="md" onPress={reset}>
              Raise another request
            </Button>
          </Card>
        ) : (
          <>
            <Text style={styles.introText}>
              Tell us what you need help with. Add photos if they help explain the issue - your
              request goes straight to the support team.
            </Text>

            <Text style={styles.sectionLabel}>Category</Text>
            {categoriesLoading ? (
              <View style={styles.skeletonChips}>
                <SkeletonLoader height={36} width={110} />
                <SkeletonLoader height={36} width={90} />
              </View>
            ) : categoriesError ? (
              <View style={styles.inlineError}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={styles.inlineErrorText}>Could not load categories.</Text>
                <Pressable onPress={retryCategories} accessibilityRole="button">
                  <Text style={styles.inlineRetry}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.chipWrap}>
                {categories.map(item => {
                  const active = category === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => {
                        setCategory(item);
                        clearFieldError('category');
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Category ${item}`}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {fieldErrors.category && (
              <Text style={styles.fieldError}>{fieldErrors.category}</Text>
            )}

            <Input
              label="Subject"
              placeholder="e.g. Printer on the 2nd floor is not working"
              value={subject}
              onChangeText={text => {
                setSubject(text);
                clearFieldError('subject');
              }}
              error={fieldErrors.subject}
              maxLength={SUBJECT_MAX_LENGTH}
              returnKeyType="next"
              accessibilityLabel="Subject"
              containerStyle={styles.field}
            />

            <Input
              label="Describe the issue"
              placeholder="What is happening, what have you tried, and when do you need it?"
              value={description}
              onChangeText={text => {
                setDescription(text);
                clearFieldError('description');
              }}
              error={fieldErrors.description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              style={styles.textarea}
              accessibilityLabel="Describe the issue"
              containerStyle={styles.field}
            />
            <Text style={styles.counter}>
              {description.trim().length.toLocaleString()} / {DESCRIPTION_MAX_LENGTH.toLocaleString()} characters
            </Text>

            <Text style={styles.sectionLabel}>Priority</Text>
            <View style={styles.chipWrap}>
              {PRIORITIES.map(item => {
                const active = priority === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => setPriority(item.value)}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && styles.chipPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Priority ${item.label}`}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {priorityHint && <Text style={styles.hint}>{priorityHint}</Text>}

            <View style={styles.attachHeader}>
              <Text style={styles.sectionLabelInline}>Photos</Text>
              <Text style={styles.attachCount}>
                {files.length} / {MAX_ATTACHMENTS}
              </Text>
            </View>

            {files.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbRow}
              >
                {files.map(file => (
                  <View key={file.uri} style={styles.thumbWrap}>
                    <Image source={{ uri: file.uri }} style={styles.thumb} accessibilityLabel={file.name} />
                    <Pressable
                      onPress={() => removeFile(file.uri)}
                      style={styles.thumbRemove}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${file.name}`}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="close" size={14} color={colors.textInverted} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Button
              variant="secondary"
              size="md"
              onPress={pickImages}
              disabled={picking || submitting || files.length >= MAX_ATTACHMENTS}
            >
              {picking ? 'Opening library...' : `Add photos (${files.length}/${MAX_ATTACHMENTS})`}
            </Button>
            {pickerError && <Text style={styles.helperError}>{pickerError}</Text>}
            {actionError && <Text style={styles.helperError}>{actionError}</Text>}

            <View style={styles.infoBox}>
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.info} />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>Images only on this device</Text>
                <Text style={styles.infoSubtitle}>
                  The mobile app can only attach photos right now. PDFs can be sent from the office
                  website instead.
                </Text>
              </View>
            </View>

            {submitting && (
              <View style={styles.progressWrap}>
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>Submitting... {uploadProgress}%</Text>
              </View>
            )}

            <Button
              variant="primary"
              size="lg"
              onPress={handleSubmit}
              disabled={submitting}
              style={styles.submitButton}
            >
              {submitting ? (
                <View style={styles.submitLoading}>
                  <ActivityIndicator size="small" color={colors.textInverted} />
                  <Text style={styles.submitLoadingText}>Submitting...</Text>
                </View>
              ) : (
                'Submit request'
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
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLabelInline: {
    ...typography.label,
    color: colors.textSecondary,
  },
  attachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  attachCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  skeletonChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: radius.medium,
    padding: spacing.md,
  },
  inlineErrorText: {
    ...typography.bodyMedium,
    color: colors.error,
    flex: 1,
  },
  inlineRetry: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.infoLight,
    borderColor: colors.infoTint,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  fieldError: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  field: {
    marginTop: spacing.lg,
  },
  textarea: {
    minHeight: 140,
    paddingTop: spacing.md,
  },
  counter: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: -spacing.md,
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  helperError: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  thumbRow: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  thumbWrap: {
    width: 72,
    height: 72,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundLite,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing.md,
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
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  successButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});
