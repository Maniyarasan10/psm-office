import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { SupportStackParamList, SupportStatus, SupportStatusStats, SupportTicket } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { EmptyState } from '../components/ui/empty-state';
import { BottomSheet } from '../components/ui/bottom-sheet';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import StatusBadge from '../components/ui/status-badge';
import { useSupport, SupportScope } from '../hooks/useSupport';
import { useBackButton } from '../hooks/useBackButton';
import {
  ALL_STATUS_FILTERS,
  PRIMARY_STATUS_FILTERS,
  needsEmployeeAction,
  statusLabel,
  statusMeta,
  toneColor,
} from '../utils/support';
import { dateField, ALL_CATEGORIES } from '../utils/documents';

type SupportNav = NativeStackNavigationProp<SupportStackParamList, 'SupportHome'>;

export function RequestRow({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const meta = statusMeta(ticket.status);
  const updated = ticket.updated_at ?? ticket.created_at;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.ticket_number}, ${ticket.subject}, ${meta.label}, ${ticket.category}`}
    >
      <View style={[styles.rowIcon, { backgroundColor: toneColor(meta.tone) + '1f' }]}>
        <MaterialCommunityIcons name={meta.icon} size={20} color={toneColor(meta.tone)} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
          {ticket.priority === 'high' && (
            <View style={styles.highPriority}>
              <MaterialCommunityIcons name="flag-variant" size={11} color={colors.error} />
              <Text style={styles.highPriorityText}>High</Text>
            </View>
          )}
        </View>
        <Text style={styles.rowSubject} numberOfLines={2}>
          {ticket.subject}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {ticket.category}
          {'  ·  '}
          {dateField(updated)}
        </Text>
      </View>

      <StatusBadge status={ticket.status} label={meta.label} />
    </Pressable>
  );
}

function ActionRow({
  icon,
  label,
  count,
  tone,
  onPress,
}: {
  icon: string;
  label: string;
  count: number;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count} requests`}
    >
      <View style={[styles.actionIcon, { backgroundColor: tone + '1f' }]}>
        <MaterialCommunityIcons name={icon} size={16} color={tone} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={[styles.actionCount, { color: tone }]}>{count}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function NeedsActionCard({
  stats,
  onSelect,
}: {
  stats: SupportStatusStats | undefined;
  onSelect: (status: SupportStatus) => void;
}) {
  const waiting = stats?.waiting ?? 0;
  const rejected = stats?.rejected ?? 0;
  if (needsEmployeeAction(stats) === 0) return null;

  return (
    <Card style={styles.actionCard}>
      <Text style={styles.actionTitle}>Needs your action</Text>
      <Text style={styles.actionSubtitle}>
        The support team is waiting to hear from you on these requests.
      </Text>
      {waiting > 0 && (
        <ActionRow
          icon="account-clock-outline"
          label="Waiting for you"
          count={waiting}
          tone={colors.warning}
          onPress={() => onSelect('waiting')}
        />
      )}
      {rejected > 0 && (
        <ActionRow
          icon="close-circle-outline"
          label="Rejected"
          count={rejected}
          tone={colors.error}
          onPress={() => onSelect('rejected')}
        />
      )}
    </Card>
  );
}

export default function SupportHomeScreen() {
  const navigation = useNavigation<SupportNav>();
  const goBack = useBackButton();
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
    requests,
    total,
    stats,
    categories,
    status,
    category,
    search,
    setStatus,
    setCategory,
    setSearch,
    resetFilters,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    reload,
    refresh,
    silentReload,
    loadMore,
  } = useSupport(scope);

  const [showFilters, setShowFilters] = useState(false);
  const firstFocusRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      silentReload();
    }, [silentReload])
  );

  const openNewRequest = useCallback(() => {
    navigation.navigate('NewRequest');
  }, [navigation]);

  const openTicket = useCallback(
    (ticketId: string) => {
      navigation.navigate('RequestDetail', { ticketId });
    },
    [navigation]
  );

  const selectStatus = useCallback(
    (next: SupportStatus | '') => {
      setStatus(next);
      setShowFilters(false);
    },
    [setStatus]
  );

  const hasFilters = status !== '' || category !== '' || search.trim().length > 0;
  const showSkeleton = loading && requests.length === 0;

  const renderEmpty = () => {
    if (showSkeleton) {
      return (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map(index => (
            <Card key={index} style={styles.skeletonCard}>
              <SkeletonLoader height={14} width={90} style={styles.skeletonLine} />
              <SkeletonLoader height={16} style={styles.skeletonLine} />
              <SkeletonLoader height={12} width={160} />
            </Card>
          ))}
        </View>
      );
    }

    if (error && requests.length === 0) {
      return (
        <Card style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
          <Text style={styles.errorText}>Unable to load your help requests.</Text>
          <Button variant="secondary" size="sm" onPress={reload} style={styles.errorButton}>
            Retry
          </Button>
        </Card>
      );
    }

    if (hasFilters) {
      return (
        <EmptyState
          icon="file-search-outline"
          title="No matching requests"
          subtitle="No request matches the current status, category or search. Try a different filter."
          actionText="Clear filters"
          onAction={resetFilters}
        />
      );
    }

    return (
      <EmptyState
        icon="lifebuoy-outline"
        title="No help requests yet"
        subtitle="Raise a request for anything you need help with - IT, HR, facilities or anything else."
        actionText="New request"
        onAction={openNewRequest}
      />
    );
  };

  const listHeader = (
    <View>
      <Card style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="lifebuoy" size={22} color={colors.primary} />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Need help with something?</Text>
            <Text style={styles.heroSubtitle}>
              Raise a request and follow every reply from the support team in one place.
            </Text>
          </View>
        </View>
        <Button variant="primary" size="lg" onPress={openNewRequest} style={styles.heroButton}>
          New request
        </Button>
      </Card>

      <NeedsActionCard stats={stats} onSelect={selectStatus} />

      <Input
        placeholder="Search ticket number or subject"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search help requests"
        containerStyle={styles.searchInput}
      />

      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {PRIMARY_STATUS_FILTERS.map(value => {
            const active = status === value;
            const label = value === '' ? 'All' : statusLabel(value);
            return (
              <Pressable
                key={value || 'all'}
                onPress={() => setStatus(value)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.rowPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter by ${label}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => setShowFilters(true)}
          style={({ pressed }) => [styles.filterButton, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="More filters"
        >
          <MaterialCommunityIcons name="filter-variant" size={16} color={colors.textSecondary} />
          {category ? (
            <Text style={styles.filterButtonText} numberOfLines={1}>
              {category}
            </Text>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {hasFilters ? `Showing ${requests.length} of ${total} requests` : `${total} requests`}
        </Text>
        {hasFilters && (
          <Pressable
            onPress={resetFilters}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>
        )}
      </View>

      {error && requests.length > 0 && (
        <View style={styles.refreshError} accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={styles.refreshErrorText}>Couldn't load the latest requests.</Text>
          <Pressable
            onPress={reload}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Retry loading requests"
          >
            <Text style={styles.refreshErrorRetry}>Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Help Desk"
        subtitle="Raise and track requests"
        leftIcon="arrow-left"
        onLeftPress={goBack}
        rightIcon="refresh"
        onRightPress={refresh}
      />

      <FlatList
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          requests.length === 0 && !showSkeleton && styles.contentEmpty,
        ]}
        data={requests}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <RequestRow ticket={item} onPress={() => openTicket(item._id)} />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
      />

      <BottomSheet visible={showFilters} onClose={() => setShowFilters(false)}>
        <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetTitle}>Filter requests</Text>

          <Text style={styles.sheetSection}>Status</Text>
          {ALL_STATUS_FILTERS.map(value => {
            const active = status === value;
            const label = value === '' ? 'All statuses' : statusLabel(value);
            const count = value === '' ? undefined : stats?.[value];
            return (
              <Pressable
                key={value || 'all-status'}
                onPress={() => selectStatus(value)}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.sheetRowText, active && styles.sheetRowActive]}>{label}</Text>
                <View style={styles.sheetRowRight}>
                  {typeof count === 'number' ? (
                    <Text style={styles.sheetRowCount}>{count}</Text>
                  ) : null}
                  {active && (
                    <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                  )}
                </View>
              </Pressable>
            );
          })}

          <Text style={styles.sheetSection}>Category</Text>
          {[ALL_CATEGORIES, ...categories].map(item => {
            const active = category === (item === ALL_CATEGORIES ? '' : item);
            return (
              <Pressable
                key={item}
                onPress={() => {
                  setCategory(item === ALL_CATEGORIES ? '' : item);
                  setShowFilters(false);
                }}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.sheetRowText, active && styles.sheetRowActive]}>{item}</Text>
                {active && <MaterialCommunityIcons name="check" size={18} color={colors.primary} />}
              </Pressable>
            );
          })}

          <Button
            variant="secondary"
            size="md"
            onPress={() => {
              resetFilters();
              setShowFilters(false);
            }}
            style={styles.sheetReset}
          >
            Reset all filters
          </Button>
        </ScrollView>
      </BottomSheet>
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
  contentEmpty: {
    flexGrow: 1,
  },
  heroCard: {
    marginTop: spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  heroSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  heroButton: {
    marginTop: spacing.lg,
  },
  actionCard: {
    marginTop: spacing.lg,
  },
  actionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  actionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  actionLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  actionCount: {
    ...typography.bodyMedium,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  searchInput: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.infoLight,
    borderColor: colors.infoTint,
  },
  chipText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 140,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  filterButtonText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  countText: {
    ...typography.label,
    color: colors.textSecondary,
    flex: 1,
  },
  clearButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  clearText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  refreshError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorTint,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  refreshErrorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
  refreshErrorRetry: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowBody: {
    flex: 1,
    marginRight: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ticketNumber: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  highPriority: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  highPriorityText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
  },
  rowSubject: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  rowMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  skeletonWrap: {
    marginTop: spacing.lg,
  },
  skeletonCard: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  skeletonLine: {
    marginBottom: spacing.xs,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.errorLight,
    borderColor: colors.errorTint,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    flex: 1,
    marginLeft: spacing.sm,
  },
  errorButton: {
    marginLeft: spacing.md,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
  sheetScroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sheetTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sheetSection: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  sheetRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetRowCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  sheetRowText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  sheetRowActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  sheetReset: {
    marginTop: spacing.xl,
  },
});
