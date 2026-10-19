import { ProjectStatus } from '../types';
import { colors } from '../theme';

export const PROJECT_STATUSES: ProjectStatus[] = ['Ongoing', 'On Hold', 'Completed'];

export interface ProjectStatusMeta {
  label: string;
  color: string;
  bg: string;
  icon: string;
}

export function projectStatusMeta(status: ProjectStatus | string): ProjectStatusMeta {
  switch (status) {
    case 'Ongoing':
      return { label: 'Ongoing', color: colors.info, bg: colors.infoLight, icon: 'progress-clock' };
    case 'On Hold':
      return { label: 'On Hold', color: colors.warning, bg: colors.warningLight, icon: 'pause-circle-outline' };
    case 'Completed':
      return { label: 'Completed', color: colors.success, bg: colors.successLight, icon: 'check-circle-outline' };
    default:
      return { label: String(status), color: colors.textSecondary, bg: colors.backgroundLite, icon: 'circle-outline' };
  }
}

/** Clamps a stored progress value to a 0-100 integer for the loading bar. */
export function clampProgress(value: number | undefined | null): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Colour ramp for the progress bar: red → amber → blue → green. */
export function progressColor(progress: number): string {
  const value = clampProgress(progress);
  if (value >= 100) return colors.success;
  if (value >= 60) return colors.primaryLight;
  if (value >= 30) return colors.warning;
  return colors.error;
}

/** "Jan 5, 2026" for a stored YYYY-MM-DD (or ISO) date; empty when unset. */
export function formatProjectDate(value?: string | null): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(match[2]) - 1] ?? match[2];
  return `${month} ${Number(match[3])}, ${match[1]}`;
}
