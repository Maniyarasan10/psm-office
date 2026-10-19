import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { DirectoryPerson, EmployeeDocument, RootStackParamList } from '../types';
import { colors, radius, spacing, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Input } from '../components/ui/input';
import { IconButton } from '../components/ui/icon-button';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { ErrorState } from '../components/ui/error-state';
import { EmptyState } from '../components/ui/empty-state';
import { DirectoryRow } from './DirectoryScreen';
import { TaskRow } from './TasksScreen';
import { DocumentRow } from './DocumentsScreen';
import { RequestRow } from './SupportHomeScreen';
import { MenuRow } from './MoreScreen';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { currentLocalIso } from '../utils/tasks';
import {
  MIN_QUERY_LENGTH,
  SEARCH_CATEGORIES,
  SearchCategoryFilter,
  SearchResult,
  groupResults,
  resultId,
} from '../utils/search';

type SearchNav = NativeStackNavigationProp<RootStackParamList, 'Search'>;

interface SearchSection {
  key: string;
  title: string;
  icon: string;
  data: SearchResult[];
}

interface Destination {
  key: string;
  icon: string;
  label: string;
}

export default function SearchScreen() {
  const navigation = useNavigation<SearchNav>();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType;

  const {
    query,
    setQuery,
    appliedQuery,
    category,
    setCategory,
    results,
    loading,
    failed,
    queried,
    run,
  } = useGlobalSearch(
    personId
      ? {
          personId,
          personType: personTypeValue,
          employeeId: employee?.employee_id,
          personName: employee?.name,
        }
      : null
  );

  const { recents, add, remove, clear } = useRecentSearches();

  const today = useMemo(() => currentLocalIso(), []);

  const recordedRef = useRef('');
  useEffect(() => {
    if (appliedQuery && results.length > 0 && recordedRef.current !== appliedQuery) {
      recordedRef.current = appliedQuery;
      add(appliedQuery);
    }
  }, [appliedQuery, results, add]);

  const trimmed = query.trim();
  const inSearchMode = trimmed.length >= MIN_QUERY_LENGTH;
  const showHint = trimmed.length > 0 && !inSearchMode;
  const allFailed = failed.length > 0 && failed.length === queried.length && results.length === 0;
  const partialFailure = failed.length > 0 && !allFailed;

  const clearQuery = useCallback(() => {
    recordedRef.current = '';
    Keyboard.dismiss();
    setQuery('');
  }, [setQuery]);

  const submit = useCallback(() => {
    Keyboard.dismiss();
    run();
  }, [run]);

  const openPerson = useCallback(
    (person: DirectoryPerson) =>
      navigation.navigate('More', {
        screen: 'EmployeeProfile',
        params: { person },
      }),
    [navigation]
  );

  const openTask = useCallback(
    (taskId: string) =>
      navigation.navigate('MainTabs', {
        screen: 'Tasks',
        params: { screen: 'TaskDetail', params: { taskId } },
      }),
    [navigation]
  );

  const openDocument = useCallback(
    (document: EmployeeDocument) =>
      navigation.navigate('Documents', {
        screen: 'DocumentDetail',
        params: { document },
      }),
    [navigation]
  );

  const openTicket = useCallback(
    (ticketId: string) =>
      navigation.navigate('Support', {
        screen: 'RequestDetail',
        params: { ticketId },
      }),
    [navigation]
  );

  const destinations = useMemo<Destination[]>(
    () => [
      { key: 'directory', icon: 'account-search-outline', label: 'Directory' },
      { key: 'tasks', icon: 'clipboard-text-outline', label: 'My tasks' },
      { key: 'attendance', icon: 'calendar-check-outline', label: 'Attendance' },
      { key: 'leave', icon: 'airplane-outline', label: 'Leave' },
      { key: 'calendar', icon: 'calendar-blank-outline', label: 'Calendar' },
      { key: 'documents', icon: 'folder-outline', label: 'Documents' },
      { key: 'support', icon: 'lifebuoy', label: 'Help desk' },
      { key: 'notifications', icon: 'bell-outline', label: 'Notifications' },
    ],
    []
  );

  const openDestination = useCallback(
    (key: string) => {
      switch (key) {
        case 'directory':
          navigation.navigate('More', { screen: 'Directory' });
          break;
        case 'tasks':
          navigation.navigate('MainTabs', { screen: 'Tasks' });
          break;
        case 'attendance':
          navigation.navigate('Attendance');
          break;
        case 'leave':
          navigation.navigate('Leave');
          break;
        case 'calendar':
          navigation.navigate('Calendar');
          break;
        case 'documents':
          navigation.navigate('Documents');
          break;
        case 'support':
          navigation.navigate('Support');
          break;
        case 'notifications':
          navigation.navigate('Notifications');
          break;
        default:
          break;
      }
    },
    [navigation]
  );

  const sections = useMemo<SearchSection[]>(
    () =>
      groupResults(results).map(group => ({
        key: group.key,
        title: group.label,
        icon: group.icon,
        data: group.results,
      })),
    [results]
  );

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => {
      switch (item.kind) {
        case 'person':
          return <DirectoryRow person={item.person} onPress={() => openPerson(item.person)} />;
        case 'task':
          return <TaskRow task={item.task} today={today} onOpen={openTask} />;
        case 'document':
          return (
            <DocumentRow document={item.document} onPress={() => openDocument(item.document)} />
          );
        case 'support':
          return <RequestRow ticket={item.ticket} onPress={() => openTicket(item.ticket._id)} />;
        default:
          return null;
      }
    },
    [openPerson, openTask, openDocument, openTicket, today]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SearchSection }) => (
      <View style={styles.sectionHeader} accessibilityRole='header'>
        <MaterialCommunityIcons name={section.icon} size={14} color={colors.textMuted} />
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.data.length}</Text>
      </View>
    ),
    []
  );

  const renderEmpty = useCallback(() => {
    if (loading || !appliedQuery) return <SearchSkeleton />;
    if (allFailed) {
      return (
        <ErrorState
          title='Search is unavailable'
          message="We couldn't reach your work sources. Check your connection and try again."
          onRetry={run}
          retryText='Try again'
        />
      );
    }
    const activeMeta = SEARCH_CATEGORIES.find(meta => meta.key === category);
    return (
      <EmptyState
        icon='magnify'
        title='No results found'
        subtitle={
          activeMeta
            ? `No matches in ${activeMeta.label}. Try a different keyword or switch to All.`
            : 'Try a different name, task, document or keyword.'
        }
        actionText={activeMeta ? 'Show all categories' : undefined}
        onAction={activeMeta ? () => setCategory('all') : undefined}
      />
    );
  }, [loading, allFailed, run, category, setCategory]);

  const chipOptions = useMemo(
    () => [
      { key: 'all' as SearchCategoryFilter, label: 'All' },
      ...SEARCH_CATEGORIES.map(meta => ({ key: meta.key as SearchCategoryFilter, label: meta.label })),
    ],
    []
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='Search'
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
        showShadow
      />

      <View style={styles.searchPanel}>
        <View style={styles.searchRow}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder='Search employees, tasks, documents...'
            containerStyle={styles.searchInput}
            returnKeyType='search'
            autoFocus
            autoCorrect={false}
            autoCapitalize='none'
            onSubmitEditing={submit}
            accessibilityLabel='Search employees, tasks, documents'
          />
          <View style={styles.searchTrailing}>
            {query.length > 0 && (
              <IconButton
                icon='close-circle'
                size='md'
                color={colors.textMuted}
                onPress={clearQuery}
                accessibilityLabel='Clear search'
              />
            )}
            {loading && (
              <ActivityIndicator
                size='small'
                color={colors.primary}
                style={styles.spinner}
                accessibilityLabel='Searching'
              />
            )}
          </View>
        </View>

        {inSearchMode && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps='handled'>
            {chipOptions.map(option => {
              const active = category === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setCategory(option.key)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole='button'
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${option.label} results`}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {showHint && (
          <Text style={styles.hint} accessibilityRole='text'>
            {`Type at least ${MIN_QUERY_LENGTH} characters to search.`}
          </Text>
        )}

        {partialFailure && (
          <View style={styles.inlineError} accessibilityRole='alert'>
            <MaterialCommunityIcons name='cloud-off-outline' size={16} color={colors.error} />
            <Text style={styles.inlineErrorText}>Some results couldn't be loaded.</Text>
            <Pressable onPress={run} accessibilityRole='button' hitSlop={8}>
              <Text style={styles.inlineErrorAction}>Retry</Text>
            </Pressable>
          </View>
        )}
      </View>

      {!inSearchMode ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.initialContent}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}>
          {recents.length > 0 && (
            <View style={styles.initialSection}>
              <View style={styles.initialHeader}>
                <Text style={styles.initialTitle} accessibilityRole='header'>
                  Recent searches
                </Text>
                <Pressable
                  onPress={clear}
                  hitSlop={8}
                  accessibilityRole='button'
                  accessibilityLabel='Clear recent searches'>
                  <Text style={styles.initialAction}>Clear all</Text>
                </Pressable>
              </View>
              <View style={styles.card}>
                {recents.map((term, index) => (
                  <View
                    key={term}
                    style={index > 0 ? [styles.recentRow, styles.recentRowDivider] : styles.recentRow}>
                    <Pressable
                      onPress={() => setQuery(term)}
                      style={styles.recentMain}
                      accessibilityRole='button'
                      accessibilityLabel={`Search for ${term}`}>
                      <MaterialCommunityIcons
                        name='history'
                        size={18}
                        color={colors.textMuted}
                        style={styles.recentIcon}
                      />
                      <Text style={styles.recentText} numberOfLines={1}>
                        {term}
                      </Text>
                    </Pressable>
                    <IconButton
                      icon='close'
                      size='sm'
                      color={colors.textMuted}
                      onPress={() => remove(term)}
                      accessibilityLabel={`Remove ${term} from recent searches`}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.initialSection}>
            <View style={styles.initialHeader}>
              <Text style={styles.initialTitle} accessibilityRole='header'>
                Browse
              </Text>
            </View>
            <View style={styles.card}>
              {destinations.map((destination, index) => (
                <View key={destination.key}>
                  {index > 0 && <View style={styles.rowDivider} />}
                  <MenuRow
                    icon={destination.icon}
                    label={destination.label}
                    tint={colors.backgroundLite}
                    onPress={() => openDestination(destination.key)}
                  />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        <SectionList<SearchResult, SearchSection>
          style={styles.container}
          sections={sections}
          keyExtractor={item => resultId(item)}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='on-drag'
          ListEmptyComponent={renderEmpty()}
          contentContainerStyle={sections.length === 0 ? styles.emptyContent : styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
        />
      )}
    </SafeAreaView>
  );
}

function SearchSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonLoader height={64} style={styles.skeletonSpacing} />
      <SkeletonLoader height={64} style={styles.skeletonSpacing} />
      <SkeletonLoader height={64} style={styles.skeletonSpacing} />
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
  searchPanel: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  searchTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 44,
    justifyContent: 'flex-end',
  },
  spinner: {
    marginLeft: spacing.xs,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverted,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  inlineErrorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
  inlineErrorAction: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing['3xl'],
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  skeletonWrap: {
    paddingVertical: spacing.lg,
  },
  skeletonSpacing: {
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  initialContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  initialSection: {
    marginBottom: spacing.xl,
  },
  initialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  initialTitle: {
    ...typography.label,
    color: colors.textSecondary,
  },
  initialAction: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: 52,
  },
  recentRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  recentMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginRight: spacing.sm,
  },
  recentIcon: {
    marginRight: spacing.md,
  },
  recentText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 72,
  },
});
