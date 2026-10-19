import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { SupportStackParamList, SupportTicket } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { IconButton } from '../components/ui/icon-button';
import { Modal } from '../components/ui/modal';
import { Toast } from '../components/ui/toast';
import { LoadingState } from '../components/ui/loading-state';
import { ErrorState } from '../components/ui/error-state';
import { EmptyState } from '../components/ui/empty-state';
import StatusBadge from '../components/ui/status-badge';
import AttachmentItem from '../components/support/attachment-item';
import { SupportDraftFile, useSupportTicket } from '../hooks/useSupportTicket';
import type { SupportScope } from '../hooks/useSupport';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  RESPONSE_MAX_LENGTH,
  SupportAction,
  actionHintFor,
  activityTitle,
  buildTimeline,
  canRespond,
  employeeActions,
  formatActivityTime,
  humanizeDetails,
  priorityMeta,
  statusMeta,
  toneColor,
} from '../utils/support';
import { formatTimestamp } from '../utils/tasks';
import { formatFileSize } from '../utils/documents';

type RequestDetailNav = NativeStackNavigationProp<SupportStackParamList, 'RequestDetail'>;
type RequestDetailRoute = RouteProp<SupportStackParamList, 'RequestDetail'>;

interface HintTone {
  background: string;
  border: string;
  icon: string;
}

const HINT_TONES: Record<string, HintTone> = {
  waiting: { background: colors.warningLight, border: colors.warningTint, icon: colors.warning },
  rejected: { background: colors.errorLight, border: colors.errorTint, icon: colors.error },
  resolved: { background: colors.successLight, border: colors.successTint, icon: colors.success },
  cancelled: { background: colors.backgroundLite, border: colors.border, icon: colors.textSecondary },
  closed: { background: colors.backgroundLite, border: colors.border, icon: colors.textSecondary },
  default: { background: colors.infoLight, border: colors.infoTint, icon: colors.info },
};

function hintToneOf(status: string): HintTone {
  return HINT_TONES[status] ?? HINT_TONES.default;
}

function hintIconOf(status: string): string {
  switch (status) {
    case 'waiting':
      return 'account-clock-outline';
    case 'rejected':
      return 'close-circle-outline';
    case 'resolved':
      return 'check-circle-outline';
    case 'cancelled':
      return 'cancel';
    case 'closed':
      return 'lock-outline';
    default:
      return 'information-outline';
  }
}

function fileNameFromUri(uri: string): string {
  const segment = uri.split('/').pop() ?? 'upload';
  return segment.includes('.') ? segment : `${segment}.jpg`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Conversation({ ticket }: { ticket: SupportTicket }) {
  const comments = ticket.comments ?? [];
  return (
    <>
      <Text style={styles.sectionLabel}>Conversation</Text>
      {comments.length === 0 ? (
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="message-text-outline" size={20} color={colors.info} />
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoTitle}>No replies yet</Text>
            <Text style={styles.infoSubtitle}>
              The support team answers here. Add a reply below if you have more details to share.
            </Text>
          </View>
        </View>
      ) : (
        comments.map((comment, index) => {
          const mine = comment.author_type === 'employee';
          const author = mine ? 'You' : comment.author || 'Support Team';
          return (
            <View
              key={`${comment.created_at ?? index}-${index}`}
              style={[styles.comment, mine ? styles.commentMine : styles.commentTheirs]}
            >
              <View style={styles.commentHead}>
                <Text style={[styles.commentAuthor, mine && styles.commentAuthorMine]}>
                  {author}
                </Text>
                <Text style={styles.commentTime}>{formatTimestamp(comment.created_at)}</Text>
              </View>
              {comment.body ? <Text style={styles.commentBody}>{comment.body}</Text> : null}
              {(comment.attachments ?? []).map(attachment => (
                <AttachmentItem key={attachment.attachment_id} attachment={attachment} />
              ))}
            </View>
          );
        })
      )}
    </>
  );
}

function History({ ticket }: { ticket: SupportTicket }) {
  const entries = buildTimeline(ticket.activity);
  if (entries.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionLabel}>History</Text>
      <Card>
        {entries.map((entry, index) => (
          <View key={`${entry.action}-${index}`} style={styles.timelineRow}>
            <View style={styles.timelineMarker}>
              <View style={styles.timelineDot} />
              {index < entries.length - 1 && <View style={styles.timelineLine} />}
            </View>
            <View style={styles.timelineBody}>
              <Text style={styles.timelineTitle}>{activityTitle(entry)}</Text>
              {entry.details ? (
                <Text style={styles.timelineDetails}>{humanizeDetails(entry.details)}</Text>
              ) : null}
              <Text style={styles.timelineTime}>{formatActivityTime(entry.timestamp)}</Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

export default function RequestDetailScreen() {
  const navigation = useNavigation<RequestDetailNav>();
  const route = useRoute<RequestDetailRoute>();
  const { ticketId } = route.params;
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
    ticket,
    loading,
    refreshing,
    error,
    forbidden,
    notFound,
    responding,
    actionBusy,
    responseError,
    actionError,
    successMessage,
    reload,
    refresh,
    clearSuccess,
    sendResponse,
    cancelRequest,
    reopenRequest,
    confirmResolution,
  } = useSupportTicket(ticketId, scope);

  const [reply, setReply] = useState('');
  const [pendingFiles, setPendingFiles] = useState<SupportDraftFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SupportAction | null>(null);

  const pickReplyImages = useCallback(async () => {
    setPickerError(null);
    const remaining = MAX_ATTACHMENTS - pendingFiles.length;
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

      const accepted: SupportDraftFile[] = [...pendingFiles];
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
      setPendingFiles(accepted);
    } catch {
      setPickerError("Couldn't open your photo library right now.");
    } finally {
      setPicking(false);
    }
  }, [pendingFiles]);

  const removePendingFile = useCallback((uri: string) => {
    setPendingFiles(prev => prev.filter(file => file.uri !== uri));
  }, []);

  const send = useCallback(async () => {
    const ok = await sendResponse(reply, pendingFiles);
    if (ok) {
      setReply('');
      setPendingFiles([]);
      setPickerError(null);
    }
  }, [reply, pendingFiles, sendResponse]);

  const confirmAction = useCallback(async () => {
    const action = pendingAction;
    if (!action) return;
    const ok =
      action.kind === 'cancel'
        ? await cancelRequest()
        : action.kind === 'reopen'
          ? await reopenRequest()
          : await confirmResolution();
    if (ok) setPendingAction(null);
  }, [pendingAction, cancelRequest, reopenRequest, confirmResolution]);

  const actions = ticket ? employeeActions(ticket) : [];
  const replyEnabled = !!ticket && canRespond(ticket);

  const renderBody = () => {
    if (loading && !ticket) return <LoadingState message="Loading request..." />;

    if (!ticket) {
      if (notFound) {
        return (
          <EmptyState
            icon="file-search-outline"
            title="Request not found"
            subtitle="This help request may have been removed."
            actionText="Back to help desk"
            onAction={() => navigation.goBack()}
          />
        );
      }

      if (forbidden) {
        return (
          <EmptyState
            icon="lock-outline"
            title="You don't have access"
            subtitle="This request belongs to another person."
            actionText="Back to help desk"
            onAction={() => navigation.goBack()}
          />
        );
      }

      return (
        <ErrorState
          title="Unable to load this request"
          message="Check your connection and try again."
          onRetry={reload}
        />
      );
    }

    const meta = statusMeta(ticket.status);
    const priority = priorityMeta(ticket.priority);
    const hint = actionHintFor(ticket);
    const tone = hintToneOf(ticket.status);
    const attachments = ticket.attachments ?? [];

    return (
      <>
        {error && (
          <View style={styles.errorBox} accessibilityRole="alert">
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>
              Couldn't refresh this request. Pull down to try again.
            </Text>
          </View>
        )}

        {hint && (
          <View
            style={[styles.hintBox, { backgroundColor: tone.background, borderColor: tone.border }]}
            accessibilityRole="alert"
          >
            <MaterialCommunityIcons name={hintIconOf(ticket.status)} size={20} color={tone.icon} />
            <View style={styles.hintText}>
              <Text style={styles.hintTitle}>{hint.title}</Text>
              <Text style={styles.hintBody}>{hint.body}</Text>
            </View>
          </View>
        )}

        <Card style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
            <StatusBadge status={ticket.status} label={meta.label} />
          </View>
          <Text style={styles.subject}>{ticket.subject}</Text>
          <View style={styles.summaryMeta}>
            <MaterialCommunityIcons name={meta.icon} size={14} color={toneColor(meta.tone)} />
            <Text style={styles.summaryMetaText}>{meta.label}</Text>
            <Text style={styles.summaryDot}>·</Text>
            <MaterialCommunityIcons
              name={priority.icon}
              size={14}
              color={ticket.priority === 'high' ? colors.error : colors.textSecondary}
            />
            <Text
              style={[
                styles.summaryMetaText,
                ticket.priority === 'high' && styles.highPriorityText,
              ]}
            >
              {priority.label} priority
            </Text>
          </View>
        </Card>

        <Text style={styles.sectionLabel}>Details</Text>
        <Card>
          <DetailRow label="Category" value={ticket.category} />
          <DetailRow label="Raised by" value={ticket.person_label || 'You'} />
          <DetailRow label="Created" value={formatTimestamp(ticket.created_at)} />
          <DetailRow label="Last updated" value={formatTimestamp(ticket.updated_at)} />
        </Card>

        <Text style={styles.sectionLabel}>Description</Text>
        <Card>
          <Text style={styles.description}>{ticket.description}</Text>
        </Card>

        {attachments.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              {attachments.length === 1 ? '1 attachment' : `${attachments.length} attachments`}
            </Text>
            <Card>
              {attachments.map(attachment => (
                <AttachmentItem key={attachment.attachment_id} attachment={attachment} />
              ))}
            </Card>
          </>
        )}

        <Conversation ticket={ticket} />
        <History ticket={ticket} />

        {actionError && (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>{actionError}</Text>
          </View>
        )}

        {actions.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Actions</Text>
            <View style={styles.actionsWrap}>
              {actions.map(action => (
                <Button
                  key={action.kind}
                  variant={action.variant}
                  size="lg"
                  disabled={actionBusy}
                  onPress={() => setPendingAction(action)}
                  style={styles.actionButton}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          </>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Request"
        subtitle={ticket ? ticket.ticket_number : undefined}
        leftIcon="arrow-left"
        onLeftPress={() => navigation.goBack()}
        rightIcon="refresh"
        onRightPress={refresh}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {successMessage && (
            <Toast message={successMessage} type="success" onClose={clearSuccess} />
          )}
          {renderBody()}
        </ScrollView>

        {replyEnabled && (
          <View style={styles.composer}>
            {responseError && <Text style={styles.composerError}>{responseError}</Text>}
            {pickerError && <Text style={styles.composerError}>{pickerError}</Text>}

            {pendingFiles.length > 0 && (
              <View style={styles.pendingRow}>
                {pendingFiles.map(file => (
                  <Pressable
                    key={file.uri}
                    onPress={() => removePendingFile(file.uri)}
                    style={styles.pendingChip}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${file.name}`}
                  >
                    <MaterialCommunityIcons name="image-outline" size={12} color={colors.primary} />
                    <Text style={styles.pendingChipText} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <MaterialCommunityIcons name="close" size={12} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.composerRow}>
              <IconButton
                icon="image-outline"
                size="md"
                color={colors.textSecondary}
                disabled={picking || responding || pendingFiles.length >= MAX_ATTACHMENTS}
                onPress={pickReplyImages}
                accessibilityLabel="Attach a photo"
              />
              <TextInput
                style={styles.composerInput}
                value={reply}
                onChangeText={setReply}
                placeholder="Write a reply..."
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={RESPONSE_MAX_LENGTH}
                accessibilityLabel="Write a reply"
              />
              <IconButton
                icon="send"
                size="md"
                color={colors.primary}
                disabled={responding || (!reply.trim() && pendingFiles.length === 0)}
                onPress={() => void send()}
                accessibilityLabel="Send reply"
              />
            </View>
            <Text style={styles.composerCount}>
              {reply.trim().length} / {RESPONSE_MAX_LENGTH.toLocaleString()}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal visible={pendingAction !== null} onClose={() => setPendingAction(null)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{pendingAction?.confirmTitle}</Text>
          <Text style={styles.modalMessage}>{pendingAction?.confirmMessage}</Text>
          <Button
            variant={pendingAction?.variant ?? 'primary'}
            size="lg"
            loading={actionBusy}
            onPress={() => void confirmAction()}
          >
            {pendingAction?.confirmLabel ?? 'Confirm'}
          </Button>
          <Button variant="ghost" size="md" onPress={() => setPendingAction(null)}>
            Keep as is
          </Button>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  hintText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  hintTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  hintBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  ticketNumber: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subject: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  summaryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  summaryMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  summaryDot: {
    ...typography.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  highPriorityText: {
    color: colors.error,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    minHeight: 36,
    gap: spacing.lg,
  },
  detailLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  description: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.infoTint,
    borderRadius: radius.medium,
    padding: spacing.lg,
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
  comment: {
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  commentMine: {
    backgroundColor: colors.infoLight,
    borderColor: colors.infoTint,
  },
  commentTheirs: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  commentAuthor: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  commentAuthorMine: {
    color: colors.primary,
  },
  commentTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  commentBody: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineMarker: {
    width: 12,
    alignItems: 'center',
    paddingTop: 5,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.lg,
  },
  timelineTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  timelineDetails: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timelineTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
  actionsWrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    alignSelf: 'stretch',
  },
  composer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  composerError: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  pendingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 160,
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pendingChipText: {
    ...typography.caption,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  composerCount: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  modalMessage: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 21,
  },
});
