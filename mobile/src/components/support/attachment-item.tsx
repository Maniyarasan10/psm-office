import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { SupportAttachment } from '../../types';
import { colors, spacing, radius, typography } from '../../theme';
import { Button } from '../ui/button';
import { isPreviewableImage, useDocumentFile } from '../../hooks/useDocumentFile';
import { supportAttachmentUrl } from '../../services/api';
import { fileTypeIcon, formatFileSize } from '../../utils/documents';

interface AttachmentItemProps {
  attachment: SupportAttachment;
}

/**
 * One attachment on a support request. Preview and save reuse the document
 * file helper, pointed at the support attachment download endpoint.
 */
export default function AttachmentItem({ attachment }: AttachmentItemProps) {
  const previewable = isPreviewableImage(attachment.file_type);
  const { previewUri, downloading, saving, savedPath, error, downloadPreview, saveToDevice } =
    useDocumentFile(
      attachment.attachment_id,
      attachment.file_name,
      attachment.file_type,
      supportAttachmentUrl
    );
  const [showPreview, setShowPreview] = useState(false);

  const openPreview = () => {
    if (!previewUri) void downloadPreview();
    setShowPreview(true);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <MaterialCommunityIcons
          name={fileTypeIcon(attachment.file_name, attachment.file_type)}
          size={18}
          color={colors.primary}
        />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {attachment.file_name}
          </Text>
          <Text style={styles.meta}>{formatFileSize(attachment.file_size)}</Text>
        </View>
        {previewable && (
          <Button variant="ghost" size="sm" onPress={openPreview} disabled={downloading}>
            {downloading ? 'Loading' : 'View'}
          </Button>
        )}
        <Button variant="ghost" size="sm" onPress={saveToDevice} disabled={saving}>
          {saving ? 'Saving' : savedPath ? 'Saved' : 'Save'}
        </Button>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Modal
        visible={showPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {attachment.file_name}
            </Text>
            <Pressable
              onPress={() => setShowPreview(false)}
              style={styles.previewClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.textInverted} />
            </Pressable>
          </View>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel={`Preview of ${attachment.file_name}`}
            />
          ) : downloading ? (
            <View style={styles.previewCenter}>
              <ActivityIndicator size="large" color={colors.textInverted} />
            </View>
          ) : (
            <View style={styles.previewCenter}>
              <MaterialCommunityIcons name="file-remove-outline" size={40} color={colors.textMuted} />
              <Text style={styles.previewError}>Couldn't load this file.</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44,
    gap: spacing.sm,
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingTop: spacing.xl,
  },
  previewTitle: {
    ...typography.subtitle,
    color: colors.textInverted,
    flex: 1,
    marginRight: spacing.md,
  },
  previewClose: {
    padding: spacing.xs,
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  previewCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewError: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
