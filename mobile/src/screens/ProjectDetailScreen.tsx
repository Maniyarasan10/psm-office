import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { DirectoryPerson, PersonType, ProjectStatus, WorkStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Button } from '../components/ui/button';
import { IconButton } from '../components/ui/icon-button';
import { Input } from '../components/ui/input';
import { BottomSheet } from '../components/ui/bottom-sheet';
import { Toast } from '../components/ui/toast';
import { SkeletonLoader } from '../components/ui/skeleton-loader';
import EmptyState from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import CalendarSheet from '../components/leave/calendar-sheet';
import { useProjectDetail, ProjectMemberRef } from '../hooks/useProjectDetail';
import { usePeopleDirectory } from '../hooks/usePeopleDirectory';
import {
  clampProgress,
  formatProjectDate,
  progressColor,
  projectStatusMeta,
  PROJECT_STATUSES,
} from '../utils/projects';
import { addMonths, todayIso } from '../utils/leave';

type Props = NativeStackScreenProps<WorkStackParamList, 'ProjectDetail'>;

const TASK_PRIORITIES = ['High', 'Medium', 'Low'] as const;
type TaskPriority = (typeof TASK_PRIORITIES)[number];

function memberKey(personId: string, personType: string): string {
  return `${personType}:${personId}`;
}

export default function ProjectDetailScreen({ route, navigation }: Props) {
  const { projectId } = route.params;
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue: PersonType = employee?.person_type ?? (personType === 'intern' ? 'intern' : 'employee');

  const viewer = useMemo(
    () => (personId ? { personId, personType: personTypeValue, isAdmin: false } : null),
    [personId, personTypeValue]
  );

  const {
    project,
    loading,
    refreshing,
    error,
    isLead,
    canManageMembers,
    saving,
    actionError,
    reload,
    refresh,
    clearActionError,
    saveStatus,
    saveMembers,
    assignTask,
  } = useProjectDetail(projectId, viewer);

  const directory = usePeopleDirectory();

  const [pendingStatus, setPendingStatus] = useState<ProjectStatus>('Ongoing');
  const [progress, setProgress] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [taskSheetVisible, setTaskSheetVisible] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('Medium');
  const [taskAssigneeKey, setTaskAssigneeKey] = useState<string | null>(null);
  const [taskDeadline, setTaskDeadline] = useState('');
  const [deadlineVisible, setDeadlineVisible] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setPendingStatus(project.status);
    setProgress(clampProgress(project.progress));
    // Re-seed only when a different project loads; quiet refetches keep edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?._id]);

  useEffect(() => {
    if (!successMessage) return;
    const timeout = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [successMessage]);

  const meta = projectStatusMeta(project?.status ?? 'Ongoing');
  const barColor = progressColor(project?.progress ?? 0);

  const openPicker = useCallback(() => {
    if (!project) return;
    const next = new Set<string>();
    (project.members ?? []).forEach(m => next.add(memberKey(m.person_id, m.person_type)));
    (project.members_detail ?? []).forEach(m => next.add(memberKey(m.person_id, m.person_type)));
    setSelected(next);
    clearActionError();
    setPickerVisible(true);
  }, [project, clearActionError]);

  const togglePerson = useCallback((person: DirectoryPerson) => {
    setSelected(prev => {
      const next = new Set(prev);
      const key = memberKey(person._id, person.person_type);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSaveTeam = useCallback(async () => {
    const members: ProjectMemberRef[] = Array.from(selected).map(key => {
      const [type, id] = key.split(':');
      return { person_id: id, person_type: type as ProjectMemberRef['person_type'] };
    });
    const ok = await saveMembers(members);
    if (ok) {
      setPickerVisible(false);
      setSuccessMessage('Team updated.');
    }
  }, [selected, saveMembers]);

  const handleSaveStatus = useCallback(async () => {
    const ok = await saveStatus(pendingStatus, progress);
    if (ok) setSuccessMessage('Project progress updated.');
  }, [pendingStatus, progress, saveStatus]);

  const adjustProgress = useCallback((delta: number) => {
    setProgress(prev => clampProgress(prev + delta));
  }, []);

  const handleProgressText = useCallback((text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) {
      setProgress(0);
      return;
    }
    setProgress(clampProgress(Number(digits)));
  }, []);

  const members = useMemo(() => project?.members_detail ?? [], [project]);

  const openTaskSheet = useCallback(() => {
    setTaskTitle('');
    setTaskDescription('');
    setTaskPriority('Medium');
    setTaskAssigneeKey(
      members.length === 1 ? memberKey(members[0].person_id, members[0].person_type) : null
    );
    setTaskDeadline('');
    setTaskError(null);
    clearActionError();
    setTaskSheetVisible(true);
  }, [members, clearActionError]);

  const handleAssignTask = useCallback(async () => {
    const title = taskTitle.trim();
    if (!title) {
      setTaskError('Enter a short task title.');
      return;
    }
    if (!taskAssigneeKey) {
      setTaskError('Select a team member to assign this task to.');
      return;
    }
    const [assigneeType, assigneeId] = taskAssigneeKey.split(':');
    setTaskError(null);
    const ok = await assignTask({
      title,
      description: taskDescription.trim() || undefined,
      assigned_to: assigneeId,
      assigned_type: assigneeType as PersonType,
      priority: taskPriority,
      deadline: taskDeadline || undefined,
    });
    if (ok) {
      setTaskSheetVisible(false);
      setSuccessMessage('Task assigned.');
    } else {
      setTaskError('Unable to assign the task. Please try again.');
    }
  }, [taskTitle, taskAssigneeKey, taskDescription, taskPriority, taskDeadline, assignTask]);

  const openDeadlinePicker = useCallback(() => {
    setTaskSheetVisible(false);
    setDeadlineVisible(true);
  }, []);

  const closeDeadlinePicker = useCallback(() => {
    setDeadlineVisible(false);
    setTaskSheetVisible(true);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header title="Project" leftIcon="arrow-left" onLeftPress={() => navigation.goBack()} showShadow />
        <View style={styles.skeletonWrap}>
          <SkeletonLoader width="80%" height={26} style={styles.skeletonSpacing} />
          <SkeletonLoader width="50%" height={18} style={styles.skeletonSpacing} />
          <SkeletonLoader height={90} style={styles.skeletonSpacing} />
          <SkeletonLoader height={150} style={styles.skeletonSpacing} />
          <SkeletonLoader height={120} style={styles.skeletonSpacing} />
        </View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <Header title="Project" leftIcon="arrow-left" onLeftPress={() => navigation.goBack()} showShadow />
        <View style={styles.stateWrap}>
          {error ? (
            <ErrorState
              title="Unable to load this project"
              message="We couldn't load the project details. Check your connection and try again."
              onRetry={reload}
              retryText="Try again"
            />
          ) : (
            <EmptyState
              title="Project not found"
              subtitle="This project may have been removed or is not available to you."
              icon="briefcase-off-outline"
              actionText="Go back"
              onAction={() => navigation.goBack()}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const startDate = formatProjectDate(project.start_date);
  const deadline = formatProjectDate(project.deadline);
  const dirty = pendingStatus !== project.status || progress !== clampProgress(project.progress);
  const deadlineMin = todayIso();
  const deadlineMax = addMonths(deadlineMin, 12);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <Header
        title="Project"
        subtitle={project.title}
        leftIcon="arrow-left"
        onLeftPress={() => navigation.goBack()}
        showShadow
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text style={styles.title}>{project.title}</Text>

        <View style={styles.metaRow}>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <MaterialCommunityIcons name={meta.icon} size={14} color={meta.color} />
            <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {project.is_confidential && (
            <View style={styles.confidentialPill}>
              <MaterialCommunityIcons name="lock-outline" size={13} color={colors.warning} />
              <Text style={styles.confidentialText}>Confidential</Text>
            </View>
          )}
        </View>

        {successMessage && (
          <View style={styles.toastWrap}>
            <Toast message={successMessage} type="success" onClose={() => setSuccessMessage(null)} />
          </View>
        )}

        <SectionLabel title="Progress" />
        <View style={styles.progressHeader}>
          <Text style={styles.progressValue}>
            {project.progress}% complete
          </Text>
          <Text style={styles.progressLead}>
            {project.team_lead_name || 'No team lead'}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${clampProgress(project.progress)}%`, backgroundColor: barColor }]}
          />
        </View>

        {isLead && (
          <>
            <SectionLabel title="Update status & progress" />
            <View style={styles.leadCard}>
              <Text style={styles.leadHint}>
                You are the project lead. Keep the company-wide board up to date.
              </Text>

              <View style={styles.statusChips}>
                {PROJECT_STATUSES.map(status => {
                  const active = status === pendingStatus;
                  const chipMeta = projectStatusMeta(status);
                  return (
                    <Pressable
                      key={status}
                      onPress={() => setPendingStatus(status)}
                      style={[
                        styles.statusChip,
                        active && { backgroundColor: chipMeta.bg, borderColor: chipMeta.color },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Set status ${status}`}>
                      <MaterialCommunityIcons
                        name={chipMeta.icon}
                        size={14}
                        color={active ? chipMeta.color : colors.textSecondary}
                      />
                      <Text style={[styles.statusChipText, active && { color: chipMeta.color }]}>
                        {status}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.progressEditor}>
                <IconButton
                  icon="minus"
                  size="md"
                  onPress={() => adjustProgress(-5)}
                  accessibilityLabel="Decrease progress by 5 percent"
                />
                <Input
                  value={String(progress)}
                  onChangeText={handleProgressText}
                  keyboardType="number-pad"
                  maxLength={3}
                  containerStyle={styles.progressInputWrap}
                  style={styles.progressInput}
                  accessibilityLabel="Project progress percent"
                />
                <IconButton
                  icon="plus"
                  size="md"
                  onPress={() => adjustProgress(5)}
                  accessibilityLabel="Increase progress by 5 percent"
                />
                <Text style={styles.percentSign}>%</Text>
              </View>

              {actionError && (
                <View style={styles.actionError} accessibilityRole="alert">
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.actionErrorText}>{actionError}</Text>
                </View>
              )}

              <Button
                variant="primary"
                size="lg"
                loading={saving}
                disabled={!dirty}
                onPress={() => {
                  void handleSaveStatus();
                }}>
                {dirty ? 'Save changes' : 'No changes to save'}
              </Button>
            </View>
          </>
        )}

        <SectionLabel title="Details" />
        <View style={styles.card}>
          <DetailRow label="Team lead" value={project.team_lead_name || 'Unassigned'} />
          <DetailRow label="Members" value={String(project.member_count ?? members.length)} />
          <DetailRow label="Start date" value={startDate || '—'} />
          <DetailRow label="Deadline" value={deadline || '—'} last />
        </View>

        {!!project.description && (
          <>
            <SectionLabel title="Description" />
            <Text style={styles.description}>{project.description}</Text>
          </>
        )}

        <View style={styles.membersHeader}>
          <SectionLabel title="Team" inline />
          {canManageMembers && (
            <Pressable
              onPress={openPicker}
              style={styles.manageButton}
              accessibilityRole="button"
              accessibilityLabel="Manage project team">
              <MaterialCommunityIcons name="account-multiple-plus-outline" size={16} color={colors.primary} />
              <Text style={styles.manageButtonText}>Manage team</Text>
            </Pressable>
          )}
        </View>

        {members.length === 0 ? (
          <Text style={styles.emptyMembers}>No team members assigned yet.</Text>
        ) : (
          <View style={styles.memberList}>
            {members.map(member => (
              <View key={memberKey(member.person_id, member.person_type)} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <MaterialCommunityIcons name="account-outline" size={18} color={colors.textSecondary} />
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.name || 'Unnamed'}
                  </Text>
                  <Text style={styles.memberSub} numberOfLines={1}>
                    {[member.designation, member.person_type === 'intern' ? 'Intern' : 'Employee']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {isLead && (
          <>
            <SectionLabel title="Assign a task" />
            <View style={styles.leadCard}>
              <Text style={styles.leadHint}>
                Give one of your team members a new task. They are notified right away.
              </Text>
              {members.length === 0 ? (
                <Text style={styles.assignEmpty}>
                  Add team members before assigning tasks.
                </Text>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onPress={openTaskSheet}
                  accessibilityLabel="Assign a task to a team member">
                  Assign a task
                </Button>
              )}
            </View>
          </>
        )}

        <Text style={styles.footnote}>
          {isLead || canManageMembers
            ? 'As the project lead you can update progress and manage the team.'
            : 'Visibility is company-wide. Only the project lead updates progress.'}
        </Text>
      </ScrollView>

      <BottomSheet visible={pickerVisible} onClose={() => setPickerVisible(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Manage team</Text>
          <Text style={styles.sheetSub}>{selected.size} selected</Text>
        </View>
        {directory.loading ? (
          <View style={styles.sheetLoading}>
            <SkeletonLoader height={52} style={styles.skeletonSpacing} />
            <SkeletonLoader height={52} style={styles.skeletonSpacing} />
            <SkeletonLoader height={52} style={styles.skeletonSpacing} />
          </View>
        ) : directory.error ? (
          <View style={styles.sheetLoading}>
            <ErrorState
              title="Unable to load people"
              message="Check your connection and try again."
              onRetry={directory.reload}
              retryText="Try again"
            />
          </View>
        ) : (
          <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
            {directory.grouped.map(section => (
              <View key={section.title}>
                <Text style={styles.sheetGroup}>{section.title}</Text>
                {section.members.map(person => {
                  const checked = selected.has(memberKey(person._id, person.person_type));
                  return (
                    <Pressable
                      key={`${person.person_type}-${person._id}`}
                      onPress={() => togglePerson(person)}
                      style={styles.personRow}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${checked ? 'Remove' : 'Add'} ${person.name}`}>
                      <MaterialCommunityIcons
                        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={22}
                        color={checked ? colors.primary : colors.textMuted}
                      />
                      <View style={styles.personInfo}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {person.name}
                        </Text>
                        <Text style={styles.personSub} numberOfLines={1}>
                          {[person.idLabel, person.person_type === 'intern' ? 'Intern' : 'Employee']
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )}

        {actionError && (
          <Text style={styles.sheetError}>{actionError}</Text>
        )}
        <View style={styles.sheetActions}>
          <Button
            variant="secondary"
            size="md"
            style={styles.sheetButton}
            onPress={() => setPickerVisible(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            style={styles.sheetButton}
            loading={saving}
            onPress={() => {
              void handleSaveTeam();
            }}>
            Save team
          </Button>
        </View>
      </BottomSheet>

      <BottomSheet visible={taskSheetVisible} onClose={() => setTaskSheetVisible(false)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Assign a task</Text>
          <Text style={styles.sheetSub}>{project.title}</Text>
        </View>
        <ScrollView style={styles.taskSheetBody} keyboardShouldPersistTaps="handled">
          <Input
            label="Title"
            value={taskTitle}
            onChangeText={setTaskTitle}
            placeholder="What needs to be done?"
            maxLength={200}
            containerStyle={styles.taskField}
            accessibilityLabel="Task title"
          />
          <Input
            label="Description (optional)"
            value={taskDescription}
            onChangeText={setTaskDescription}
            placeholder="Add details or acceptance criteria"
            multiline
            maxLength={5000}
            containerStyle={styles.taskField}
            style={styles.taskDescriptionInput}
            accessibilityLabel="Task description"
          />

          <Text style={styles.taskGroupLabel}>Assign to</Text>
          <View style={styles.taskPeople}>
            {members.map(member => {
              const key = memberKey(member.person_id, member.person_type);
              const checked = taskAssigneeKey === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTaskAssigneeKey(key)}
                  style={styles.taskPersonRow}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: checked }}
                  accessibilityLabel={`Assign to ${member.name || 'team member'}`}>
                  <MaterialCommunityIcons
                    name={checked ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={checked ? colors.primary : colors.textMuted}
                  />
                  <View style={styles.personInfo}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {member.name || 'Unnamed'}
                    </Text>
                    <Text style={styles.personSub} numberOfLines={1}>
                      {member.person_type === 'intern' ? 'Intern' : 'Employee'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.taskGroupLabel}>Priority</Text>
          <View style={styles.statusChips}>
            {TASK_PRIORITIES.map(priority => {
              const active = priority === taskPriority;
              return (
                <Pressable
                  key={priority}
                  onPress={() => setTaskPriority(priority)}
                  style={[styles.statusChip, active && styles.priorityChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Set priority ${priority}`}>
                  <Text style={[styles.statusChipText, active && styles.priorityChipTextActive]}>
                    {priority}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.taskGroupLabel}>Due date (optional)</Text>
          <View style={styles.taskDeadlineRow}>
            <Pressable
              onPress={openDeadlinePicker}
              style={styles.taskDeadlineButton}
              accessibilityRole="button"
              accessibilityLabel="Choose a due date">
              <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={colors.primary} />
              <Text style={styles.taskDeadlineText}>
                {taskDeadline ? formatProjectDate(taskDeadline) || taskDeadline : 'No due date'}
              </Text>
            </Pressable>
            {!!taskDeadline && (
              <Pressable
                onPress={() => setTaskDeadline('')}
                accessibilityRole="button"
                accessibilityLabel="Clear due date">
                <Text style={styles.taskDeadlineClear}>Clear</Text>
              </Pressable>
            )}
          </View>

          {taskError && (
            <View style={styles.actionError} accessibilityRole="alert">
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.actionErrorText}>{taskError}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.sheetActions}>
          <Button
            variant="secondary"
            size="md"
            style={styles.sheetButton}
            onPress={() => setTaskSheetVisible(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            style={styles.sheetButton}
            loading={saving}
            disabled={!taskTitle.trim() || !taskAssigneeKey}
            onPress={() => {
              void handleAssignTask();
            }}>
            Assign task
          </Button>
        </View>
      </BottomSheet>

      <CalendarSheet
        visible={deadlineVisible}
        mode="start"
        value={taskDeadline}
        minDate={deadlineMin}
        maxDate={deadlineMax}
        title="Due date"
        hint="Optional. Choose a date within the next 12 months."
        onConfirm={date => setTaskDeadline(date)}
        onClose={closeDeadlinePicker}
      />
    </SafeAreaView>
  );
}

function SectionLabel({ title, inline }: { title: string; inline?: boolean }) {
  return (
    <Text style={[styles.sectionLabel, inline && styles.sectionLabelInline]} accessibilityRole="header">
      {title}
    </Text>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
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
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusPillText: {
    ...typography.caption,
    fontWeight: '700',
  },
  confidentialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.warningLight,
  },
  confidentialText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '700',
  },
  toastWrap: {
    marginTop: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLabelInline: {
    marginTop: 0,
    marginBottom: 0,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  progressLead: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
    overflow: 'hidden',
  },
  progressFill: {
    height: 10,
    borderRadius: radius.pill,
  },
  leadCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  leadHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  statusChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  progressEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressInputWrap: {
    flex: 1,
    marginBottom: 0,
  },
  progressInput: {
    textAlign: 'center',
  },
  percentSign: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontWeight: '700',
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
  description: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  membersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.infoLight,
  },
  manageButtonText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  emptyMembers: {
    ...typography.body,
    color: colors.textMuted,
  },
  memberList: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundLite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  memberSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xl,
    textAlign: 'center',
    lineHeight: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  sheetSub: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sheetLoading: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetList: {
    paddingHorizontal: spacing.lg,
    maxHeight: 380,
  },
  sheetGroup: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  personSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sheetError: {
    ...typography.caption,
    color: colors.error,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheetButton: {
    flex: 1,
  },
  assignEmpty: {
    ...typography.caption,
    color: colors.textMuted,
  },
  taskSheetBody: {
    paddingHorizontal: spacing.lg,
    maxHeight: 420,
  },
  taskField: {
    marginBottom: spacing.md,
  },
  taskDescriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  taskGroupLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  taskPeople: {
    marginBottom: spacing.sm,
  },
  taskPersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  priorityChipActive: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  priorityChipTextActive: {
    color: colors.primary,
  },
  taskDeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  taskDeadlineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  taskDeadlineText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  taskDeadlineClear: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '700',
  },
});
