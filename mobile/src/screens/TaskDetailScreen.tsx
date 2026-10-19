import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { Task, TaskComment, TaskStatus, TasksStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { IconButton } from '../components/ui/icon-button';
import { StatusBadge } from '../components/ui/status-badge';
import { Modal } from '../components/ui/modal';
import { Toast } from '../components/ui/toast';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import EmptyState from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { useTasks } from '../hooks/useTasks';
import {
  currentLocalIso,
  dueColor,
  dueInfo,
  formatDeadlineLong,
  formatTimestamp,
  nextStatusAction,
  priorityMeta,
  statusIcon,
} from '../utils/tasks';

type Props = NativeStackScreenProps<TasksStackParamList, 'TaskDetail'>;

const COMMENT_MAX_LENGTH = 5000;

function successMessageFor(label: string): string {
  switch (label) {
    case 'Start task':
      return 'Task started.';
    case 'Mark complete':
      return 'Task marked as completed.';
    case 'Reopen task':
      return 'Task reopened.';
    default:
      return 'Task status updated.';
  }
}

export default function TaskDetailScreen({ route, navigation }: Props) {
  const { taskId } = route.params;
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const {
    tasks,
    loading,
    refreshing,
    error,
    submitting,
    actionError,
    sendingComment,
    commentError,
    reload,
    refresh,
    updateStatus,
    addComment,
    clearCommentError,
  } = useTasks(
    personId ? { personId, personType: personTypeValue, authorName: employee?.name ?? '' } : null
  );

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const today = useMemo(() => currentLocalIso(), []);
  const task: Task | null = useMemo(
    () => tasks.find(item => item._id === taskId) ?? null,
    [tasks, taskId]
  );

  useEffect(() => {
    if (!successMessage) return;
    const timeout = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [successMessage]);

  const runAction = useCallback(
    async (label: string, nextStatus: TaskStatus) => {
      if (!task) return;
      const ok = await updateStatus(task._id, nextStatus);
      if (ok) setSuccessMessage(successMessageFor(label));
    },
    [task, updateStatus]
  );

  const handlePrimaryAction = useCallback(() => {
    if (!task) return;
    const action = nextStatusAction(task);
    if (!action) return;
    if (action.requiresConfirm) {
      setConfirmVisible(true);
      return;
    }
    void runAction(action.label, action.nextStatus);
  }, [task, runAction]);

  const handleConfirmComplete = useCallback(async () => {
    if (!task) return;
    setConfirmVisible(false);
    await runAction('Mark complete', 'Completed');
  }, [task, runAction]);

  const handleSendComment = useCallback(async () => {
    if (!task || sendingComment) return;
    const body = commentText.trim();
    if (!body) return;
    const ok = await addComment(task._id, body);
    if (ok) setCommentText('');
  }, [task, commentText, sendingComment, addComment]);

  const handleChangeComment = useCallback(
    (text: string) => {
      setCommentText(text);
      if (commentError) clearCommentError();
    },
    [commentError, clearCommentError]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header title="Task" leftIcon="arrow-left" onLeftPress={() => navigation.goBack()} showShadow />
        <View style={styles.skeletonWrap}>
          <SkeletonLoader width="85%" height={26} style={styles.skeletonSpacing} />
          <SkeletonLoader width="60%" height={18} style={styles.skeletonSpacing} />
          <SkeletonLoader height={48} style={styles.skeletonSpacing} />
          <SkeletonLoader height={56} style={styles.skeletonSpacing} />
          <SkeletonLoader height={140} style={styles.skeletonSpacing} />
          <SkeletonLoader height={200} style={styles.skeletonSpacing} />
        </View>
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header title="Task" leftIcon="arrow-left" onLeftPress={() => navigation.goBack()} showShadow />
        <View style={styles.stateWrap}>
          {error ? (
            <ErrorState
              title="Unable to load this task"
              message="We couldn't load the task details. Check your connection and try again."
              onRetry={reload}
              retryText="Try again"
            />
          ) : (
            <EmptyState
              title="Task not found"
              subtitle="This task may have been removed, reassigned, or is no longer available."
              icon="clipboard-text-off-outline"
              actionText="Go back"
              onAction={() => navigation.goBack()}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const due = dueInfo(task.deadline, today);
  const priority = priorityMeta(task.priority);
  const dueToneColor = dueColor(due.tone);
  const duePillBackground =
    due.tone === 'overdue' ? colors.warningLight : due.tone === 'today' ? colors.infoLight : colors.backgroundLite;
  const action = nextStatusAction(task);

  const detailRows: Array<{ key: string; label: string; value: React.ReactNode }> = [
    {
      key: 'status',
      label: 'Status',
      value: (
        <View style={styles.detailStatus}>
          <MaterialCommunityIcons
            name={statusIcon(task.status)}
            size={14}
            color={colors.textSecondary}
          />
          <StatusBadge status={task.status} />
        </View>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      value: (
        <View style={styles.detailStatus}>
          <MaterialCommunityIcons name={priority.icon} size={14} color={priority.color} />
          <Text style={[styles.detailValue, { color: priority.color }]}>{task.priority}</Text>
        </View>
      ),
    },
    {
      key: 'deadline',
      label: 'Deadline',
      value: (
        <Text style={[styles.detailValue, due.tone === 'overdue' && styles.detailValueWarning]}>
          {formatDeadlineLong(task.deadline)}
        </Text>
      ),
    },
    ...(task.created_by_name
      ? [
          {
            key: 'assigned_by',
            label: 'Assigned by',
            value: <Text style={styles.detailValue}>{task.created_by_name}</Text>,
          },
        ]
      : []),
    ...(task.created_at
      ? [
          {
            key: 'created',
            label: 'Created',
            value: <Text style={styles.detailValue}>{formatTimestamp(task.created_at)}</Text>,
          },
        ]
      : []),
    ...(task.updated_at
      ? [
          {
            key: 'updated',
            label: 'Last updated',
            value: <Text style={styles.detailValue}>{formatTimestamp(task.updated_at)}</Text>,
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Task"
        subtitle={task.title}
        leftIcon="arrow-left"
        onLeftPress={() => navigation.goBack()}
        showShadow
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{task.title}</Text>

          <View style={styles.metaRow}>
            <StatusBadge status={task.status} />
            <View style={styles.priorityWrap}>
              <MaterialCommunityIcons name={priority.icon} size={14} color={priority.color} />
              <Text style={[styles.priorityText, { color: priority.color }]}>{priority.label}</Text>
            </View>
          </View>

          <View style={[styles.duePill, { backgroundColor: duePillBackground }]}>
            <MaterialCommunityIcons name={due.icon} size={14} color={dueToneColor} />
            <Text style={[styles.duePillText, { color: dueToneColor }]}>{due.label}</Text>
            {task.deadline ? (
              <Text style={styles.duePillFull}>{formatDeadlineLong(task.deadline)}</Text>
            ) : null}
          </View>

          {action && (
            <View style={styles.actionBlock}>
              {successMessage && (
                <View style={styles.toastWrap}>
                  <Toast message={successMessage} type="success" onClose={() => setSuccessMessage(null)} />
                </View>
              )}
              {actionError && (
                <View style={styles.actionError} accessibilityRole="alert">
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.actionErrorText}>{actionError}</Text>
                </View>
              )}
              <Button
                variant="primary"
                size="lg"
                loading={submitting}
                onPress={handlePrimaryAction}
                accessibilityLabel={action.label}
              >
                {action.label}
              </Button>
              <Text style={styles.actionHint}>
                Moves this task from {task.status} to {action.nextStatus}.
              </Text>
            </View>
          )}

          <SectionLabel title="Description" />
          {task.description ? (
            <Text style={styles.description}>{task.description}</Text>
          ) : (
            <Text style={styles.descriptionEmpty}>No description provided.</Text>
          )}

          <SectionLabel title="Details" />
          <View style={styles.card}>
            {detailRows.map((row, index) => (
              <View
                key={row.key}
                style={[styles.detailRow, index === detailRows.length - 1 && styles.detailRowLast]}
              >
                <Text style={styles.detailLabel}>{row.label}</Text>
                {row.value}
              </View>
            ))}
          </View>

          {task.remarks ? (
            <>
              <SectionLabel title="Notes" />
              <Text style={styles.description}>{task.remarks}</Text>
            </>
          ) : null}

          <SectionLabel title="Messages" />
          <TaskConversation
            comments={task.comments ?? []}
            personType={personTypeValue}
            personName={employee?.name ?? ''}
          />
        </ScrollView>

        <View style={styles.composer}>
          {commentError ? <Text style={styles.composerError}>{commentError}</Text> : null}
          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              value={commentText}
              onChangeText={handleChangeComment}
              placeholder="Write a message..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={COMMENT_MAX_LENGTH}
              accessibilityLabel="Write a message"
            />
            <IconButton
              icon="send"
              size="md"
              color={colors.primary}
              disabled={sendingComment || !commentText.trim()}
              onPress={() => {
                void handleSendComment();
              }}
              accessibilityLabel="Send message"
            />
          </View>
          <Text style={styles.composerCount}>
            {commentText.trim().length} / {COMMENT_MAX_LENGTH.toLocaleString()}
          </Text>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={confirmVisible} onClose={() => setConfirmVisible(false)} animationType="fade">
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>Mark task as completed?</Text>
          <Text style={styles.confirmSub}>
            This moves "{task.title}" to Completed. You can reopen it later if the work is not
            finished.
          </Text>
          <View style={styles.confirmActions}>
            <Button
              variant="secondary"
              size="md"
              onPress={() => setConfirmVisible(false)}
              style={styles.confirmButton}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={submitting}
              onPress={() => {
                void handleConfirmComplete();
              }}
              style={styles.confirmButton}
            >
              Complete
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text style={styles.sectionLabel} accessibilityRole="header">
      {title}
    </Text>
  );
}

function TaskConversation({
  comments,
  personType,
  personName,
}: {
  comments: TaskComment[];
  personType: string;
  personName: string;
}) {
  if (comments.length === 0) {
    return (
      <View style={styles.infoBox}>
        <MaterialCommunityIcons name="message-text-outline" size={20} color={colors.info} />
        <View style={styles.infoTextWrap}>
          <Text style={styles.infoTitle}>No messages yet</Text>
          <Text style={styles.infoSubtitle}>
            Send a message to discuss this task. Admin replies show up here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      {comments.map((comment, index) => {
        const mine = comment.author_type === personType && comment.author === personName;
        const author = mine ? 'You' : comment.author || 'Admin';
        return (
          <View
            key={`${comment.created_at ?? index}-${index}`}
            style={[styles.comment, mine ? styles.commentMine : styles.commentTheirs]}
          >
            <View style={styles.commentHead}>
              <Text style={[styles.commentAuthor, mine && styles.commentAuthorMine]} numberOfLines={1}>
                {author}
              </Text>
              <Text style={styles.commentTime}>{formatTimestamp(comment.created_at)}</Text>
            </View>
            {comment.body ? <Text style={styles.commentBody}>{comment.body}</Text> : null}
          </View>
        );
      })}
    </View>
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
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  skeletonWrap: {
    padding: spacing.lg,
  },
  skeletonSpacing: {
    marginBottom: spacing.md,
  },
  stateWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  priorityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  priorityText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  duePillText: {
    ...typography.caption,
    fontWeight: '700',
  },
  duePillFull: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  actionBlock: {
    marginTop: spacing.xl,
  },
  actionError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  actionErrorText: {
    ...typography.bodyMedium,
    color: colors.error,
    flex: 1,
  },
  toastWrap: {
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.sm,
  },
  actionHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  descriptionEmpty: {
    ...typography.body,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    minHeight: 48,
    gap: spacing.md,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  detailValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  detailValueWarning: {
    color: colors.warning,
  },
  detailStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirm: {
    padding: spacing['2xl'],
  },
  confirmTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  confirmSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  confirmButton: {
    flex: 1,
  },
  flex: {
    flex: 1,
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
    flexShrink: 1,
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
});
