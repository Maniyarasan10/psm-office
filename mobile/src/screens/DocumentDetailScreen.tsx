import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DocumentsStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useDocumentFile, isPreviewableImage } from '../hooks/useDocumentFile';
import { dateField, fileDisplayType, fileTypeIcon, formatFileSize } from '../utils/documents';

export default function DocumentDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<DocumentsStackParamList, 'DocumentDetail'>>();
  const route = useRoute<RouteProp<DocumentsStackParamList, 'DocumentDetail'>>();
  const { document } = route.params;

  const previewable = isPreviewableImage(document.file_type);
  const { previewUri, downloading, saving, savedPath, error, downloadPreview, saveToDevice } =
    useDocumentFile(document._id, document.file_name, document.file_type);

  const [showPreview, setShowPreview] = React.useState(false);

  const openPreview = () => {
    if (!previewUri) {
      void downloadPreview();
    }
    setShowPreview(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Document"
        leftIcon="arrow-left"
        onLeftPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.fileCard}>
          <View style={styles.fileIcon}>
            <MaterialCommunityIcons name={fileTypeIcon(document.file_name, document.file_type)} size={32} color={colors.primary} />
          </View>
          <Text style={styles.fileName}>{document.file_name}</Text>
          <Badge label={document.category} variant="info" />
        </Card>

        <SectionTitle title="Details" />
        <Card style={styles.detailsCard}>
          <DetailRow label="Type" value={fileDisplayType(document.file_type)} />
          <DetailRow label="Size" value={formatFileSize(document.file_size)} />
          <DetailRow label="Uploaded" value={dateField(document.uploaded_at)} />
          {document.linked_person && (
            <DetailRow label="Linked person" value={document.linked_person} />
          )}
        </Card>

        {previewable && (
          <>
            <SectionTitle title="Preview" />
            <Button variant="primary" size="md" onPress={openPreview} disabled={downloading}>
              {downloading ? 'Loading preview…' : 'View preview'}
            </Button>
          </>
        )}

        {!previewable && (
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information-outline" size={20} color={colors.info} />
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoTitle}>Preview isn't available</Text>
              <Text style={styles.infoSubtitle}>
                This device can only preview image files. You can still save the file to the app's
                storage.
              </Text>
            </View>
          </View>
        )}

        <SectionTitle title="Download" />
        <Button
          variant="secondary"
          size="md"
          onPress={saveToDevice}
          disabled={saving}
          style={styles.saveButton}
        >
          {saving ? 'Saving…' : savedPath ? 'Save again' : 'Save file to this device'}
        </Button>

        {savedPath && (
          <View style={styles.successRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.success} />
            <Text style={styles.successText} numberOfLines={2}>
              Saved to this device (app storage).
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{document.file_name}</Text>
            <Pressable
              onPress={() => setShowPreview(false)}
              style={styles.previewClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel={`Preview of ${document.file_name}`}
            />
          ) : downloading ? (
            <View style={styles.previewLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.previewLoading}>
              <MaterialCommunityIcons name="file-remove-outline" size={40} color={colors.textMuted} />
              <Text style={styles.previewErrorText}>Couldn't load this file.</Text>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
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
    paddingBottom: spacing['3xl'],
  },
  fileCard: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  fileIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.large,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  detailsCard: {
    marginBottom: spacing.xl,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    minHeight: 36,
  },
  detailLabel: {
    ...typography.body,
    color: colors.textSecondary,
    marginRight: spacing.lg,
  },
  detailValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
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
  saveButton: {
    marginTop: spacing.sm,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  successText: {
    ...typography.caption,
    color: colors.success,
    flex: 1,
    marginLeft: spacing.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
    marginLeft: spacing.sm,
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
  previewLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewErrorText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});