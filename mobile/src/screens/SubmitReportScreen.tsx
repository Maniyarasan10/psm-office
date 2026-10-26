import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList, DailyReport } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { Header } from '../components/ui/header';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { submitReport, getMyReports } from '../services/api';
import { todayIso } from '../utils/leave';

type SubmitReportNav = NativeStackNavigationProp<RootStackParamList, 'SubmitReport'>;
type SubmitReportRoute = NativeStackScreenProps<RootStackParamList, 'SubmitReport'>['route'];

export default function SubmitReportScreen() {
  const navigation = useNavigation<SubmitReportNav>();
  const route = useRoute<SubmitReportRoute>();
  const { employee, personType } = useAuth();
  const personId = employee?._id ?? '';
  const personTypeValue = employee?.person_type ?? personType ?? 'employee';

  const [today, setToday] = useState(todayIso());
  const [content, setContent] = useState('');
  const [hours, setHours] = useState('');
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  const todayReport = useMemo(
    () => reports.find((r) => r.date === today),
    [reports, today]
  );

  const didFocusOnce = useRef(false);
  const loadReports = useCallback(async () => {
    if (!personId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyReports(personId, personTypeValue);
      const list = res.data?.reports || [];
      setReports(list);

      const targetId = route.params?.reportId;
      if (targetId) {
        const existing = list.find((r) => r._id === targetId);
        if (existing) {
          setContent(existing.content || '');
          setHours(String(existing.hours || ''));
          setEditing(true);
        }
      } else if (todayReport && !saved) {
        // Pre-fill when opening the edit of an already-submitted today report.
        setContent(todayReport.content || '');
        setHours(String(todayReport.hours || ''));
        setEditing(true);
      }
    } catch {
      setError("Couldn't load your reports");
    } finally {
      setLoading(false);
    }
  }, [personId, personTypeValue, route.params?.reportId, todayReport, saved]);

  const didFocusOnceRef = didFocusOnce;
  useFocusEffect(
    useCallback(() => {
      if (didFocusOnceRef.current) {
        loadReports();
      } else {
        didFocusOnceRef.current = true;
        loadReports();
      }
    }, [loadReports])
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Please describe what you worked on today.');
      return;
    }
    const hoursValue = hours.trim() ? Number(hours) : undefined;
    if (hoursValue !== undefined && (!Number.isFinite(hoursValue) || hoursValue < 0)) {
      setError('Enter a valid number of hours.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submitReport({ date: today, content: trimmed, hours: hoursValue });
      setSaved(true);
      setEditing(false);
      await loadReports();
    } catch {
      setError("Couldn't save your report. Try again.");
    } finally {
      setSaving(false);
    }
  }, [content, hours, today, loadReports]);

  const handleEdit = useCallback(() => {
    if (todayReport) {
      setContent(todayReport.content || '');
      setHours(String(todayReport.hours || ''));
    }
    setEditing(true);
    setError(null);
    setSaved(false);
  }, [todayReport]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style='dark' />
        <Header
          title='Daily Report'
          subtitle={today}
          leftIcon='arrow-left'
          onLeftPress={() => navigation.goBack()}
          showShadow
        />
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonLine} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !todayReport) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style='dark' />
        <Header
          title='Daily Report'
          subtitle={today}
          leftIcon='arrow-left'
          onLeftPress={() => navigation.goBack()}
          showShadow
        />
        <ErrorState title='Unable to load reports' message={error} onRetry={loadReports} retryText='Try again' />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style='dark' />
      <Header
        title='Daily Report'
        subtitle={today}
        leftIcon='arrow-left'
        onLeftPress={() => navigation.goBack()}
        rightIcon='refresh'
        onRightPress={loadReports}
        showShadow
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadReports} />}>
        {todayReport && !editing && !saved ? (
          <View style={styles.submittedCard}>
            <Text style={styles.submittedLabel}>Submitted today</Text>
            <Card>
              <Text style={styles.reportContent}>{todayReport.content}</Text>
              {todayReport.hours != null && (
                <View style={styles.hoursRow}>
                  <Text style={styles.hoursLabel}>Hours</Text>
                  <Text style={styles.hoursValue}>{String(todayReport.hours)} h</Text>
                </View>
              )}
              <Text style={styles.submittedAt}>
                Submitted{' '}
                {new Date(todayReport.submitted_at || todayReport.updated_at || today).toLocaleString(
                  [],
                  { hour: '2-digit', minute: '2-digit' }
                )}
              </Text>
            </Card>
            <Button
              variant='ghost'
              onPress={handleEdit}
              disabled={saving}
            >
              Update report
            </Button>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>What did you work on today?</Text>
            <Input
              label='Work progress'
              multiline
              numberOfLines={5}
              value={content}
              onChangeText={setContent}
              error={error && !saved ? 'Enter your work progress' : undefined}
              placeholder="E.g. Completed the client dashboard design and reviewed two pull requests."
            />
            <Input
              label='Hours worked (optional)'
              keyboardType='numeric'
              value={hours}
              onChangeText={setHours}
              placeholder='e.g. 8'
            />
            {!saved && (
              <View style={styles.buttonRow}>
                <Button
                  variant='primary'
                  onPress={handleSubmit}
                  disabled={saving || !content.trim()}
                  loading={saving}
                  accessibilityLabel='Submit daily report'
                >
                  {todayReport ? 'Update report' : 'Submit report'}
                </Button>
              </View>
            )}
            {saved && (
              <View style={styles.savedRow}>
                <Text style={styles.savedText}>Report saved for {today}.</Text>
                <Pressable onPress={handleEdit} style={styles.editLink} accessibilityRole='button'>
                  <Text style={styles.editLinkText}>Make changes</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
        {!todayReport && reports.length === 0 && !loading && !saved ? (
          <EmptyState
            icon='clipboard-text-outline'
            title='No reports yet'
            subtitle='Submit your first daily work report above.'
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  skeletonWrap: { padding: spacing.lg },
  skeletonLine: {
    height: 14,
    backgroundColor: colors.backgroundLite,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
    width: '45%',
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.xl,
  },
  buttonRow: { marginTop: spacing.lg, gap: spacing.sm },
  savedRow: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
  },
  savedText: { ...typography.bodyMedium, color: colors.success, marginBottom: spacing.sm },
  editLink: { marginTop: spacing.xs },
  editLinkText: { ...typography.bodyMedium, color: colors.primary, fontWeight: '600' },
  submittedCard: { marginBottom: spacing.lg },
  submittedLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  reportContent: { ...typography.body, color: colors.textPrimary },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  hoursLabel: { ...typography.caption, color: colors.textMuted },
  hoursValue: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '600' },
  submittedAt: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
} as const;
