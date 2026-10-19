import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { DocumentsStackParamList, EmployeeDocument } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { BottomSheet } from '../components/ui/bottom-sheet';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { useDocuments } from '../hooks/useDocuments';
import { useBackButton } from '../hooks/useBackButton';
import {
  ALL_CATEGORIES,
  dateField,
  fileDisplayType,
  fileTypeIcon,
} from '../utils/documents';

type DocumentsNav = NativeStackNavigationProp<DocumentsStackParamList, 'DocumentsHome'>;

export function DocumentRow({
  document,
  onPress,
}: {
  document: EmployeeDocument;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.docRow, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${document.file_name}`}
    >
      <View style={styles.docIcon}>
        <MaterialCommunityIcons name={fileTypeIcon(document.file_name, document.file_type)} size={22} color={colors.primary} />
      </View>
      <View style={styles.docContent}>
        <Text style={styles.docName} numberOfLines={1}>{document.file_name}</Text>
        <Text style={styles.docMeta} numberOfLines={1}>
          {document.category}
          {' · '}{fileDisplayType(document.file_type)}
          {document.uploaded_at ? ` · ${dateField(document.uploaded_at)}` : ''}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export default function DocumentsScreen() {
  const navigation = useNavigation<DocumentsNav>();
  const goBack = useBackButton();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const {
    myDocuments,
    companyDocuments,
    categories,
    filterCategory,
    setFilterCategory,
    loading,
    refreshing,
    error,
    reload,
    refresh,
    silentReload,
  } = useDocuments(personId ? { _id: personId, employee_id: employee?.employee_id, name: employee?.name } : null);

  const [showCategorySheet, setShowCategorySheet] = React.useState(false);

  useFocusEffect(
    useCallback(() => {
      silentReload();
    }, [silentReload])
  );

  const openDetail = useCallback(
    (document: EmployeeDocument) => {
      navigation.navigate('DocumentDetail', { document });
    },
    [navigation]
  );

  const openUpload = useCallback(() => {
    navigation.navigate('UploadDocument');
  }, [navigation]);

  const filterLabel = filterCategory || ALL_CATEGORIES;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Documents"
        leftIcon="arrow-left"
        onLeftPress={goBack}
        rightIcon="refresh"
        onRightPress={refresh}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <Card style={styles.uploadCard}>
          <View style={styles.uploadHeader}>
            <View style={styles.uploadIcon}>
              <MaterialCommunityIcons name="file-upload-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.uploadTextWrap}>
              <Text style={styles.uploadTitle}>Submit a document</Text>
              <Text style={styles.uploadSubtitle}>
                Upload a scan, photo or document for the office. Any file type is accepted.
              </Text>
            </View>
          </View>
          <Button variant="primary" size="lg" onPress={openUpload} style={styles.uploadButton}>
            Upload document
          </Button>
        </Card>

        <SectionTitle
          title="Documents"
          right={
            categories.length > 0 ? (
              <Pressable
                onPress={() => setShowCategorySheet(true)}
                style={styles.filterChip}
                accessibilityRole="button"
                accessibilityLabel="Filter documents by category"
              >
                <MaterialCommunityIcons name="filter-variant" size={14} color={colors.textSecondary} />
                <Text style={styles.filterChipText} numberOfLines={1}>{filterLabel}</Text>
              </Pressable>
            ) : undefined
          }
        />

        {loading ? (
          <Card>
            <SkeletonLoader height={48} style={styles.skeletonSpacing} />
            <SkeletonLoader height={48} style={styles.skeletonSpacing} />
            <SkeletonLoader height={48} style={styles.skeletonSpacing} />
          </Card>
        ) : error ? (
          <Card style={styles.errorCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
            <Text style={styles.errorText}>Unable to load documents.</Text>
            <Button variant="secondary" size="sm" onPress={reload} style={styles.retryButton}>
              Retry
            </Button>
          </Card>
        ) : (
          <>
            <SectionTitle title="My documents" />
            {myDocuments.length === 0 ? (
              <InfoRow icon="file-document-outline" title="No documents submitted yet">
                Submissions you upload will appear here. The office reviews files separately — review
                status isn't shown in this app yet.
              </InfoRow>
            ) : (
              <Card style={styles.listCard}>
                {myDocuments.map((doc, index) => (
                  <View key={doc._id}>
                    <DocumentRow document={doc} onPress={() => openDetail(doc)} />
                    {index < myDocuments.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </Card>
            )}

            <SectionTitle title="Company documents" />
            {companyDocuments.length === 0 ? (
              <InfoRow icon="folder-open-outline" title="No shared documents available">
                Files shared by the office will appear here.
              </InfoRow>
            ) : (
              <Card style={styles.listCard}>
                {companyDocuments.map((doc, index) => (
                  <View key={doc._id}>
                    <DocumentRow document={doc} onPress={() => openDetail(doc)} />
                    {index < companyDocuments.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      <BottomSheet visible={showCategorySheet} onClose={() => setShowCategorySheet(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Filter by category</Text>
          {[ALL_CATEGORIES, ...categories].map(item => (
            <Pressable
              key={item}
              onPress={() => {
                setFilterCategory(item === ALL_CATEGORIES ? '' : item);
                setShowCategorySheet(false);
              }}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${item}`}
            >
              <Text style={[styles.sheetRowText, item === filterLabel && styles.sheetRowActive]}>{item}</Text>
              {item === filterLabel && (
                <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {right}
    </View>
  );
}

function InfoRow({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoBox}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.textMuted} />
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoSubtitle}>{children}</Text>
      </View>
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
  uploadCard: {
    marginTop: spacing.lg,
  },
  uploadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  uploadTextWrap: {
    flex: 1,
  },
  uploadTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  uploadSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  uploadButton: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    maxWidth: 180,
  },
  filterChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    minHeight: 64,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 64,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  docContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  docName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  docMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    borderColor: colors.errorTint,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
    marginLeft: spacing.sm,
  },
  retryButton: {
    marginLeft: spacing.md,
  },
  skeletonSpacing: {
    marginBottom: spacing.sm,
  },
  sheetContent: {
    paddingHorizontal: spacing.lg,
  },
  sheetTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  sheetRowText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sheetRowActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});