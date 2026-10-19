export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const ALL_CATEGORIES = 'All categories';

export function formatFileSize(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileTypeIcon(name: string, fileType?: string): string {
  const extended = fileType?.toLowerCase() ?? '';
  const lowerName = name.toLowerCase();
  if (extended === '.pdf' || lowerName.includes('.pdf')) return 'file-pdf-box';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].includes(extended)) return 'file-image-outline';
  if (['.doc', '.docx'].includes(extended) || lowerName.includes('.doc')) return 'file-word-outline';
  if (['.xls', '.xlsx', '.csv'].includes(extended)) return 'file-excel-outline';
  if (['.ppt', '.pptx'].includes(extended)) return 'file-powerpoint-outline';
  if (['.zip', '.rar', '.tar', '.gz', '.7z'].includes(extended)) return 'folder-zip-outline';
  return 'file-outline';
}

export function fileDisplayType(fileType?: string): string {
  const normalized = (fileType ?? '').toUpperCase().replace(/^\./, '');
  return normalized || 'FILE';
}

export function dateField(value?: string): string {
  if (!value) return '—';
  const iso = value.slice(0, 10);
  if (!/\d{4}-\d{2}-\d{2}/.test(iso)) return value;
  const date = new Date(iso.replace(/-/g, '/') + ' 00:00:00');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function defaultSubmissionCategory(personType: string): string {
  return personType === 'intern' ? 'Intern Documents' : 'Employee Documents';
}

export function submissionCategories(personType: string): string[] {
  const first = defaultSubmissionCategory(personType);
  return first === 'Certificates'
    ? ['Certificates']
    : [first, 'Certificates'];
}