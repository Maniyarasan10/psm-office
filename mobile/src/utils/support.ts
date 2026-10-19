import { colors } from '../theme';
import { SupportActivityEntry, SupportPriority, SupportStatus, SupportStatusStats, SupportTicket } from '../types';
import { formatTimestamp } from './tasks';

/**
 * Limits mirrored from the support backend so the app can explain a rejection
 * before a request is sent. The server remains authoritative.
 */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const SUBJECT_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 10000;
export const RESPONSE_MAX_LENGTH = 10000;

export const SUPPORT_PAGE_SIZE = 20;

export type SupportTone = 'info' | 'primary' | 'warning' | 'success' | 'error' | 'neutral';

interface StatusMeta {
  label: string;
  icon: string;
  tone: SupportTone;
}

const STATUS_META: Record<SupportStatus, StatusMeta> = {
  open: { label: 'Open', icon: 'circle-outline', tone: 'info' },
  in_progress: { label: 'In progress', icon: 'progress-check', tone: 'primary' },
  waiting: { label: 'Waiting for you', icon: 'account-clock-outline', tone: 'warning' },
  resolved: { label: 'Resolved', icon: 'check-circle-outline', tone: 'success' },
  rejected: { label: 'Rejected', icon: 'close-circle-outline', tone: 'error' },
  cancelled: { label: 'Cancelled', icon: 'cancel', tone: 'neutral' },
  closed: { label: 'Closed', icon: 'lock-outline', tone: 'neutral' },
};

/** Chip filters map 1:1 onto backend statuses so filtering stays server-side. */
export const PRIMARY_STATUS_FILTERS: ReadonlyArray<SupportStatus | ''> = [
  '',
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
];

export const ALL_STATUS_FILTERS: ReadonlyArray<SupportStatus | ''> = [
  '',
  'open',
  'in_progress',
  'waiting',
  'resolved',
  'rejected',
  'cancelled',
  'closed',
];

export function statusMeta(status: SupportStatus | string): StatusMeta {
  return STATUS_META[status as SupportStatus] ?? {
    label: status ? status.replace(/_/g, ' ') : 'Unknown',
    icon: 'circle-outline',
    tone: 'neutral',
  };
}

export function statusLabel(status: SupportStatus | string): string {
  return statusMeta(status).label;
}

export function statusIcon(status: SupportStatus | string): string {
  return statusMeta(status).icon;
}

export function toneColor(tone: SupportTone): string {
  switch (tone) {
    case 'info':
      return colors.info;
    case 'primary':
      return colors.primary;
    case 'warning':
      return colors.warning;
    case 'success':
      return colors.success;
    case 'error':
      return colors.error;
    default:
      return colors.textSecondary;
  }
}

export interface PriorityMeta {
  label: string;
  color: string;
  icon: string;
}

export function priorityMeta(priority: SupportPriority | string): PriorityMeta {
  switch (priority) {
    case 'high':
      return { label: 'High', color: colors.error, icon: 'flag-variant' };
    case 'low':
      return { label: 'Low', color: colors.textMuted, icon: 'flag-variant-outline' };
    default:
      return { label: 'Medium', color: colors.textSecondary, icon: 'flag-variant-outline' };
  }
}

/** Requests where the support team is waiting for the employee to reply. */
export function needsEmployeeAction(stats: SupportStatusStats | undefined): number {
  if (!stats) return 0;
  return (stats.waiting ?? 0) + (stats.rejected ?? 0);
}

/** Active requests: open plus in progress. */
export function openRequestCount(stats: SupportStatusStats | undefined): number {
  if (!stats) return 0;
  return (stats.open ?? 0) + (stats.in_progress ?? 0);
}

/* ------------------------------ Employee actions ------------------------------ */

export function canRespond(ticket: SupportTicket): boolean {
  return ticket.status !== 'cancelled' && ticket.status !== 'closed';
}

export function canCancel(ticket: SupportTicket): boolean {
  return ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waiting';
}

export function canReopen(ticket: SupportTicket): boolean {
  return ticket.status === 'resolved' || ticket.status === 'rejected' || ticket.status === 'closed';
}

export function canConfirmResolution(ticket: SupportTicket): boolean {
  return ticket.status === 'resolved';
}

export type SupportActionKind = 'confirm' | 'reopen' | 'cancel';

export interface SupportAction {
  kind: SupportActionKind;
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel: string;
  variant: 'primary' | 'secondary' | 'destructive';
}

/** Actions the backend lets the requesting employee perform, primary first. */
export function employeeActions(ticket: SupportTicket): SupportAction[] {
  const actions: SupportAction[] = [];

  if (canConfirmResolution(ticket)) {
    actions.push({
      kind: 'confirm',
      label: 'Confirm resolved',
      confirmTitle: 'Confirm this request is resolved?',
      confirmMessage: 'This closes the request. You can reopen it later if the issue returns.',
      confirmLabel: 'Confirm',
      variant: 'primary',
    });
  }

  if (canReopen(ticket)) {
    actions.push({
      kind: 'reopen',
      label: 'Reopen request',
      confirmTitle: 'Reopen this request?',
      confirmMessage: 'The request goes back to the support team as open.',
      confirmLabel: 'Reopen',
      variant: 'secondary',
    });
  }

  if (canCancel(ticket)) {
    actions.push({
      kind: 'cancel',
      label: 'Cancel request',
      confirmTitle: 'Cancel this request?',
      confirmMessage:
        'The support team will stop working on it. You can raise a new request if you still need help.',
      confirmLabel: 'Cancel request',
      variant: 'destructive',
    });
  }

  return actions;
}

/** Banner shown above the details when the employee owes a response. */
export function actionHintFor(ticket: SupportTicket): { title: string; body: string } | null {
  if (ticket.status === 'waiting') {
    return {
      title: 'Waiting for your response',
      body: 'The support team needs more information from you. Add a reply below to continue.',
    };
  }
  if (ticket.status === 'rejected') {
    return {
      title: 'This request was rejected',
      body: 'Add more information as a reply, or reopen the request to send it back to the support team.',
    };
  }
  if (ticket.status === 'resolved') {
    return {
      title: 'Marked as resolved',
      body: 'Confirm below that everything is working, or reopen the request if the issue is not fixed.',
    };
  }
  if (ticket.status === 'cancelled') {
    return {
      title: 'This request was cancelled',
      body: 'No further work will be done on it. Raise a new request if you still need help.',
    };
  }
  if (ticket.status === 'closed') {
    return {
      title: 'This request is closed',
      body: 'You can reopen it if the problem comes back.',
    };
  }
  return null;
}

/* --------------------------------- Validation --------------------------------- */

export type SupportFieldKey = 'category' | 'subject' | 'description';
export type SupportFieldErrors = Partial<Record<SupportFieldKey, string>>;

export interface NewRequestValues {
  category: string;
  subject: string;
  description: string;
}

export function validateNewRequest(values: NewRequestValues): SupportFieldErrors {
  const errors: SupportFieldErrors = {};

  if (!values.category.trim()) {
    errors.category = 'Choose a category so your request reaches the right team.';
  }

  const subject = values.subject.trim();
  if (!subject) {
    errors.subject = 'Add a short subject so we know what this is about.';
  } else if (subject.length > SUBJECT_MAX_LENGTH) {
    errors.subject = `Keep the subject under ${SUBJECT_MAX_LENGTH} characters.`;
  }

  const description = values.description.trim();
  if (!description) {
    errors.description = 'Please describe the issue before submitting.';
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep the description under ${DESCRIPTION_MAX_LENGTH.toLocaleString()} characters.`;
  }

  return errors;
}

export function hasFieldErrors(errors: SupportFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/* --------------------------------- Activity --------------------------------- */

const STATUS_IN_TEXT: Record<string, SupportStatus> = {
  open: 'open',
  in_progress: 'in_progress',
  waiting: 'waiting',
  resolved: 'resolved',
  rejected: 'rejected',
  cancelled: 'cancelled',
  closed: 'closed',
};

const PRIORITY_IN_TEXT: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Rewrites backend transition strings ("open → in_progress") for display. */
export function humanizeDetails(details?: string): string {
  if (!details) return '';
  return details.replace(/[a-z_]+/g, match => {
    const status = STATUS_IN_TEXT[match];
    if (status) return statusLabel(status);
    return PRIORITY_IN_TEXT[match] ?? match;
  });
}

export function activityTitle(entry: SupportActivityEntry): string {
  switch (entry.action) {
    case 'created':
      return 'Request submitted';
    case 'status_changed':
      return 'Status changed';
    case 'priority_changed':
      return 'Priority changed';
    case 'response':
      return entry.author_type === 'support' ? 'Support replied' : 'You responded';
    default:
      return 'Updated';
  }
}

/**
 * Activity entries used in the history timeline. Responses are excluded here
 * because they already appear in the conversation.
 */
export function buildTimeline(activity: SupportActivityEntry[] | undefined): SupportActivityEntry[] {
  return (activity ?? [])
    .filter(entry => entry.action !== 'response')
    .slice()
    .reverse();
}

export function formatActivityTime(timestamp?: string): string {
  return formatTimestamp(timestamp);
}
