import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Alert,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { useAnnouncement } from '../hooks/useAnnouncement';
import { useBackButton } from '../hooks/useBackButton';
import { announcementDayLabel, announcementTimeLabel } from '../utils/announcements';

export default function AnnouncementsScreen() {
  const {
    announcements,
    loading,
    refreshing,
    error,
    reload,
    refresh,
    canSend,
    sending,
    publish,
    syncPermission,
    removeAnnouncement,
    editAnnouncement,
  } = useAnnouncement();
  const goBack = useBackButton();
  const [composeVisible, setComposeVisible] = useState(false);
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editingId, setEditingId] = useState<string>('');
  const [editTopic, setEditTopic] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const now = Date.now();

  useFocusEffect(
    useCallback(() => {
      syncPermission();
    }, [syncPermission])
  );

  const retry = useCallback(() => {
    reload();
  }, [reload]);

  const openCompose = useCallback(() => {
    setTopic('');
    setContent('');
    setSubmitError(null);
    setComposeVisible(true);
  }, []);

  const closeCompose = useCallback(() => {
    setSubmitError(null);
    setComposeVisible(false);
  }, []);

  const submit = useCallback(async () => {
    const res = await publish(topic, content);
    if (res.ok) {
      setSubmitError(null);
      setComposeVisible(false);
    } else {
      setSubmitError(res.message ?? 'Failed to publish.');
    }
  }, [content, publish, topic]);

  const openEdit = useCallback((item: (typeof announcements)[number]) => {
    setEditingId(item._id);
    setEditTopic(item.topic?.trim() || '');
    setEditContent(item.content);
    setEditError(null);
    setEditVisible(true);
  }, [announcements]);

  const closeEdit = useCallback(() => {
    setEditVisible(false);
    setEditingId('');
    setEditTopic('');
    setEditContent('');
    setEditError(null);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingId) return;
    if (!editContent.trim()) {
      setEditError('Announcement content is required');
      return;
    }
    const res = await editAnnouncement(editingId, editTopic, editContent);
    if (res.ok) {
      setEditError(null);
      closeEdit();
    } else {
      setEditError(res.message ?? 'Failed to update.');
    }
  }, [editingId, editTopic, editContent, editAnnouncement, closeEdit]);

  const handleLongPress = useCallback((item: (typeof announcements)[number]) => {
    if (!canSend) return;
    Alert.alert('Announcement', `What would you like to do with "${item.topic?.trim() || 'this announcement'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Edit',
        style: 'default',
        onPress: () => openEdit(item),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const confirmed = await new Promise<boolean>(resolve => {
            Alert.alert('Delete announcement', 'Remove this announcement for everyone?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
          if (confirmed) {
            const ok = await removeAnnouncement(item._id);
            if (!ok) {
              Alert.alert('Delete failed', 'Could not remove this announcement. Try again.');
            }
          }
        },
      },
    ]);
  }, [canSend, openEdit, removeAnnouncement]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Announcements"
        leftIcon="arrow-left"
        onLeftPress={goBack}
        rightIcon="refresh"
        onRightPress={refresh}
        showShadow
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {loading ? (
          <AnnouncementSkeleton />
        ) : error ? (
          <ErrorState
            title="Unable to load announcements"
            message="Check your connection and try again."
            onRetry={retry}
            retryText="Try again"
          />
        ) : announcements.length === 0 ? (
          <EmptyState
            icon="bullhorn-outline"
            title="No announcements yet"
            subtitle="You're up to date. The company hasn't published an announcement."
          />
        ) : (
          <View style={styles.list}>
            {announcements.map(item => (
              <Pressable
                onLongPress={() => handleLongPress(item)}
                style={styles.announcement}
                key={item._id}
                accessibilityRole="button"
                accessibilityLabel={`${item.topic?.trim() || 'Announcement'}, by ${item.author_name ?? 'office'}`}
              >
                <View style={styles.announcementHeader}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="bullhorn" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.headerText}>
                    <Text style={styles.announcementTitle}>
                      {item.topic?.trim() || 'Announcement'}
                    </Text>
                    <Text style={styles.announcementCaption}>
                      {item.author_name ? `By ${item.author_name}` : 'Official notice from the office'}
                    </Text>
                  </View>
                  <View style={styles.timeTag}>
                    <Text style={styles.timeTagDay}>{announcementDayLabel(item.created_at, now)}</Text>
                    <Text style={styles.timeTagTime}>{announcementTimeLabel(item.created_at)}</Text>
                  </View>
                </View>

                <Text style={styles.announcementBody}>{item.content}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {canSend === true && (
          <View style={styles.compose}>
            <Button variant="secondary" size="md" onPress={openCompose}>
              Send an announcement
            </Button>
            <Text style={styles.composeHint}>
              You're allowed to publish company announcements for everyone.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={composeVisible} onClose={closeCompose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalInner}
        >
          <Text style={styles.modalTitle}>New announcement</Text>
          <Text style={styles.modalSubtitle}>
            Publishing sends this message to all employees right away.
          </Text>
          <Input
            label="Topic"
            value={topic}
            onChangeText={setTopic}
            placeholder="Announcement topic"
            maxLength={120}
            containerStyle={styles.composeField}
          />
          <Input
            label="Message"
            value={content}
            onChangeText={setContent}
            placeholder="Write your announcement..."
            multiline
            maxLength={1000}
            textAlignVertical="top"
            containerStyle={styles.composeField}
            style={styles.composeInput}
          />
          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
          <View style={styles.modalActions}>
            <Button
              variant="secondary"
              size="lg"
              style={styles.modalButton}
              onPress={closeCompose}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              style={styles.modalButton}
              onPress={submit}
              loading={sending}
              disabled={!topic.trim() || !content.trim()}
            >
              Publish
            </Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editVisible} onClose={closeEdit}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalInner}
        >
          <Text style={styles.modalTitle}>Edit announcement</Text>
          <Text style={styles.modalSubtitle}>
            Changes are sent to everyone who received the original message.
          </Text>
          <Input
            label="Topic"
            value={editTopic}
            onChangeText={setEditTopic}
            placeholder="Announcement topic"
            maxLength={120}
            containerStyle={styles.composeField}
          />
          <Input
            label="Message"
            value={editContent}
            onChangeText={setEditContent}
            placeholder="Write your announcement..."
            multiline
            maxLength={1000}
            textAlignVertical="top"
            containerStyle={styles.composeField}
            style={styles.composeInput}
          />
          {editError ? <Text style={styles.submitError}>{editError}</Text> : null}
          <View style={styles.modalActions}>
            <Button
              variant="secondary"
              size="lg"
              style={styles.modalButton}
              onPress={closeEdit}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              style={styles.modalButton}
              onPress={submitEdit}
              loading={sending}
              disabled={!editContent.trim()}
            >
              Save
            </Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function AnnouncementSkeleton() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonHeader}>
        <SkeletonLoader width={44} height={44} borderRadius={22} />
        <View style={styles.skeletonHeaderText}>
          <SkeletonLoader width="55%" height={16} />
          <SkeletonLoader width="40%" height={12} />
        </View>
      </View>
      <SkeletonLoader height={14} style={styles.skeletonLine} />
      <SkeletonLoader height={14} style={styles.skeletonLine} />
      <SkeletonLoader height={14} style={styles.skeletonLine} />
      <SkeletonLoader height={14} width="75%" style={styles.skeletonLine} />
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
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  list: {
    gap: spacing.md,
  },
  announcement: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    padding: spacing.lg,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  announcementTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  announcementCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  announcementBody: {
    ...typography.body,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 25,
  },
  timeTag: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  timeTagDay: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  timeTagTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  skeleton: {
    gap: spacing.xs,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: 6,
  },
  skeletonLine: {
    marginBottom: spacing.sm,
  },
  compose: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  composeHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  modalInner: {
    padding: spacing.lg,
  },
  modalTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  composeField: {
    marginBottom: spacing.sm,
  },
  composeInput: {
    minHeight: 120,
  },
  submitError: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
});