import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  Pressable,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MoreStackParamList, DirectoryPerson } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Avatar } from '../components/ui/avatar';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { EmptyState } from '../components/ui/empty-state';
import { BottomSheet } from '../components/ui/bottom-sheet';
import { usePeopleDirectory } from '../hooks/usePeopleDirectory';
import { avatarSource, initialsOf, roleLabel } from '../utils/people';

type DirectoryNav = NativeStackNavigationProp<MoreStackParamList, 'Directory'>;

const ALL_DEPARTMENTS = 'All departments';

export function DirectoryRow({ person, onPress }: { person: DirectoryPerson; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole='button'
      accessibilityLabel={`Open profile of ${person.name}`}>
      <Avatar source={avatarSource(person.photoPath)} fallbackText={initialsOf(person.name)} size='md' />
      <View style={styles.rowContent}>
        <Text style={styles.rowName} numberOfLines={1}>
          {person.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {roleLabel(person)}
          {person.department ? ` · ${person.department}` : ''}
        </Text>
      </View>
      <MaterialCommunityIcons name='chevron-right' size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export default function DirectoryScreen() {
  const navigation = useNavigation<DirectoryNav>();
  const {
    grouped,
    departments,
    search,
    setSearch,
    departmentFilter,
    setDepartmentFilter,
    loading,
    refreshing,
    error,
    reload,
    refresh,
  } = usePeopleDirectory();

  const [showFilter, setShowFilter] = useState(false);

  const openProfile = useCallback(
    (person: DirectoryPerson) => {
      navigation.navigate('EmployeeProfile', { person });
    },
    [navigation]
  );

  const filterLabel = departmentFilter || ALL_DEPARTMENTS;

  const sections = grouped.map(group => ({
    title: group.title,
    data: group.members,
    count: group.members.length,
  }));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='Directory'
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
        rightIcon='filter-variant'
        onRightPress={() => setShowFilter(true)}
      />

      <View style={styles.searchWrap}>
        <Input
          placeholder='Search by name, department or role'
          value={search}
          onChangeText={setSearch}
          containerStyle={styles.searchInputContainer}
          autoCorrect={false}
          returnKeyType='done'
        />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <Card>
            <SkeletonLoader height={56} style={styles.skeletonSpacing} />
            <SkeletonLoader height={56} style={styles.skeletonSpacing} />
            <SkeletonLoader height={56} style={styles.skeletonSpacing} />
            <SkeletonLoader height={56} style={styles.skeletonSpacing} />
          </Card>
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <EmptyState
            title='Unable to load the directory'
            subtitle='We could not reach the office directory. Please check your connection and try again.'
            icon='account-search-outline'
            actionText='Try again'
            onAction={reload}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={person => person._id}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='on-drag'
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.count}</Text>
            </View>
          )}
          renderItem={({ item }) => <DirectoryRow person={item} onPress={() => openProfile(item)} />}
          ListHeaderComponent={null}
          ListEmptyComponent={
            <EmptyState
              title='No people found'
              subtitle={
                search
                  ? 'No one matches your search. Try a different name or department.'
                  : 'There are no people listed in the directory yet.'
              }
              icon='account-multiple-outline'
            />
          }
        />
      )}

      <BottomSheet visible={showFilter} onClose={() => setShowFilter(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Filter by department</Text>
          {[ALL_DEPARTMENTS, ...departments].map(item => {
            const isActive = item === filterLabel;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  setDepartmentFilter(item === ALL_DEPARTMENTS ? '' : item);
                  setShowFilter(false);
                }}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.rowPressed]}
                accessibilityRole='button'
                accessibilityLabel={`Filter by ${item}`}>
                <Text style={[styles.sheetRowText, isActive && styles.sheetRowActive]}>{item}</Text>
                {isActive && <MaterialCommunityIcons name='check' size={18} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  searchInputContainer: {
    marginBottom: 0,
  },
  loadingWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  skeletonSpacing: {
    marginBottom: spacing.sm,
  },
  stateWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sectionCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 68,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowContent: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  rowName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  rowMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
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