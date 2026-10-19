import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Project, ProjectStatus, WorkStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Card } from '../components/ui/card';
import { Header } from '../components/ui/header';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import { useBackButton } from '../hooks/useBackButton';
import { useProjects } from '../hooks/useProjects';
import {
  PROJECT_STATUSES,
  clampProgress,
  formatProjectDate,
  progressColor,
  projectStatusMeta,
} from '../utils/projects';

type StatusFilter = 'All' | ProjectStatus;

const FILTERS: StatusFilter[] = ['All', ...PROJECT_STATUSES];

export default function WorkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<WorkStackParamList>>();
  const goBack = useBackButton();
  const { projects, loading, refreshing, error, reload, refresh, silentReload } = useProjects();
  const [filter, setFilter] = useState<StatusFilter>('All');

  const didFocusOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnce.current) silentReload();
      else didFocusOnce.current = true;
    }, [silentReload])
  );

  const visible = useMemo(
    () => (filter === 'All' ? projects : projects.filter(project => project.status === filter)),
    [projects, filter]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Work"
        subtitle="Company projects"
        leftIcon="arrow-left"
        onLeftPress={goBack}
        rightIcon="refresh"
        onRightPress={refresh}
        showShadow
      />

      {loading ? (
        <View style={styles.skeletonWrap}>
          <SkeletonLoader width="40%" height={14} style={styles.skeletonSpacing} />
          <SkeletonLoader height={150} style={styles.skeletonSpacing} />
          <SkeletonLoader height={150} style={styles.skeletonSpacing} />
          <SkeletonLoader height={150} style={styles.skeletonSpacing} />
        </View>
      ) : error ? (
        <ErrorState
          title="Unable to load projects"
          message="Check your connection and try again."
          onRetry={reload}
          retryText="Try again"
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title="No projects yet"
          subtitle="Projects assigned by the admin will appear here."
        />
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <View style={styles.filterRow}>
            {FILTERS.map(option => {
              const active = option === filter;
              return (
                <Pressable
                  key={option}
                  onPress={() => setFilter(option)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${option.toLowerCase()} projects`}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {visible.length === 0 ? (
            <View style={styles.noMatch}>
              <MaterialCommunityIcons name="filter-outline" size={20} color={colors.textMuted} />
              <Text style={styles.noMatchText}>No {filter.toLowerCase()} projects.</Text>
            </View>
          ) : (
            visible.map(project => (
              <ProjectCard
                key={project._id}
                project={project}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: project._id })}
              />
            ))
          )}

          <Text style={styles.footnote}>
            Company-wide project overview. Tap a project for details and team.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ProjectCard({ project, onPress }: { project: Project; onPress: () => void }) {
  const meta = projectStatusMeta(project.status);
  const progress = clampProgress(project.progress);
  const barColor = progressColor(progress);
  const members = project.members_detail ?? [];
  const deadline = formatProjectDate(project.deadline);
  const startDate = formatProjectDate(project.start_date);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open project ${project.title}`}
      style={({ pressed }) => [styles.cardPress, pressed && styles.cardPressed]}>
      <Card style={styles.projectCard}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusIcon, { backgroundColor: meta.bg }]}>
            <MaterialCommunityIcons name={meta.icon} size={20} color={meta.color} />
          </View>
          <Text style={styles.projectTitle} numberOfLines={2}>
            {project.title}
          </Text>
          {project.is_confidential && (
            <MaterialCommunityIcons
              name="lock-outline"
              size={16}
              color={colors.warning}
              style={styles.lockIcon}
            />
          )}
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {!!project.description && (
          <Text style={styles.description} numberOfLines={3}>
            {project.description}
          </Text>
        )}

        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Progress</Text>
          <Text style={[styles.progressValue, { color: barColor }]}>{progress}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: barColor }]} />
        </View>

        <View style={styles.metaRow}>
          <MetaItem
            icon="account-tie-outline"
            label="Team lead"
            value={project.team_lead_name || 'Unassigned'}
          />
          <MetaItem
            icon="account-multiple-outline"
            label="Members"
            value={String(project.member_count ?? members.length)}
          />
        </View>

        {(!!startDate || !!deadline) && (
          <View style={styles.metaRow}>
            <MetaItem icon="calendar-start" label="Start" value={startDate || '—'} />
            <MetaItem icon="calendar-end" label="Deadline" value={deadline || '—'} />
          </View>
        )}

        {members.length > 0 && (
          <View style={styles.membersBlock}>
            <Text style={styles.membersLabel}>Team</Text>
            <View style={styles.membersWrap}>
              {members.map(member => (
                <View key={`${member.person_id}-${member.person_type}`} style={styles.memberChip}>
                  <Text style={styles.memberChipText} numberOfLines={1}>
                    {member.name || 'Unnamed'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <MaterialCommunityIcons name={icon} size={16} color={colors.textMuted} />
      <View style={styles.metaTextWrap}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue} numberOfLines={1}>
          {value}
        </Text>
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
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  skeletonWrap: {
    padding: spacing.lg,
  },
  skeletonSpacing: {
    marginBottom: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: colors.textInverted,
  },
  noMatch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    padding: spacing.lg,
  },
  noMatchText: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  projectCard: {
    marginBottom: spacing.md,
  },
  cardPress: {
    borderRadius: radius.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  lockIcon: {
    marginRight: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  projectTitle: {
    flex: 1,
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusPillText: {
    ...typography.caption,
    fontWeight: '700',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  progressLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  progressValue: {
    ...typography.subtitle,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: radius.pill,
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  metaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaTextWrap: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  metaValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  membersBlock: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  membersLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  membersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  memberChip: {
    maxWidth: '48%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
  },
  memberChipText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
