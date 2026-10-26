import axios, { AxiosProgressEvent, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { secureGetItem, secureSetItem, secureDeleteItem, secureMultiDelete } from './secureStorage';
import { ENV } from '../config/env';
import type { ServerNotification } from '../notifications/types';
import {
  Employee,
  AttendanceRecord,
  AttendanceSummary,
  Settings,
  Task,
  TaskStatus,
  EmployeeDocument,
  PersonType,
  Project,
  LeaveRequest,
  SupportRequestListResponse,
  SupportTicket,
  BirthdayEntry,
  Announcement,
  PersonalCalendarItem,
  DailyReport,
} from '../types';

const API_BASE = ENV.API_BASE_URL;

export const API_HOST = API_BASE.replace(/\/api\/?$/, '');
const HOST = API_HOST;

/** Turns a stored media path (or absolute CDN URL) into a loadable URL. */
export const resolveMediaUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${HOST}${path}`;
  return path;
};

export const AUTH_TOKEN_KEY = 'psm_auth_token';
export const AUTH_REFRESH_TOKEN_KEY = 'psm_auth_refresh_token';

let authToken: string | null = null;
let authTokenExp: number | null = null;

/**
 * The server signs compact ``body.signature`` tokens (not JWT). The body is
 * URL-safe base64 encoded JSON, so it must be decoded from index 0 with the
 * base64url alphabet padded back to a multiple of four.
 */
const decodeTokenPayload = (token: string): Record<string, unknown> | null => {
  try {
    const body = token.split('.', 1)[0];
    if (!body) return null;
    const base64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Remember the bearer token for the current session (in memory). */
export const setAuthToken = (token: string | null): void => {
  authToken = token;
  authTokenExp = null;
  if (token) {
    const payload = decodeTokenPayload(token);
    if (payload && typeof payload.exp === 'number') {
      authTokenExp = payload.exp * 1000;
    }
  }
};

export const clearAuthToken = (): void => {
  authToken = null;
  authTokenExp = null;
};

/**
 * Returns the current bearer token for the session, restoring it from secure
 * storage if it has not been loaded yet. Returns null if the token has expired.
 */
export const getAuthToken = async (): Promise<string | null> => {
  if (authToken) {
    if (authTokenExp != null && Date.now() >= authTokenExp - 60000) {
      // Token expires within 1 minute; treat as expired so refresh can run.
      return null;
    }
    return authToken;
  }
  try {
    const stored = await secureGetItem(AUTH_TOKEN_KEY);
    if (stored) {
      setAuthToken(stored);
      if (authTokenExp != null && Date.now() >= authTokenExp - 60000) {
        return null;
      }
      return authToken;
    }
  } catch {
    authToken = null;
  }
  return null;
};

/** Returns true when the stored access token is present and not near expiry. */
export const isTokenValid = async (): Promise<boolean> => {
  const token = await getAuthToken();
  return token != null;
};

/** Get the remaining seconds until the access token expires (null if unknown). */
export const getTokenExpiryInSeconds = (): number | null => {
  if (authTokenExp == null) return null;
  return Math.max(0, Math.round((authTokenExp - Date.now()) / 1000));
};

/** Called when a session can no longer be restored (refresh failed/expired). */
let onAuthFailure: (() => void) | null = null;

export const setOnAuthFailure = (fn: (() => void) | null): void => {
  onAuthFailure = fn;
};

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange the stored refresh token for a fresh access token pair. */
async function attemptTokenRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = await secureGetItem(AUTH_REFRESH_TOKEN_KEY);
      if (!refreshToken) return false;
      const res = await api.post<{ token?: string; refresh_token?: string }>(
        '/auth/refresh-token',
        { refresh_token: refreshToken }
      );
      const nextToken = res.data?.token;
      if (!nextToken) return false;
      setAuthToken(nextToken);
      await secureSetItem(AUTH_TOKEN_KEY, nextToken);
      const nextRefresh = res.data?.refresh_token;
      if (nextRefresh) {
        // Rotation: replace the old refresh token with the new one.
        await secureDeleteItem(AUTH_REFRESH_TOKEN_KEY);
        await secureSetItem(AUTH_REFRESH_TOKEN_KEY, nextRefresh);
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Revoke tokens on the server and clear local state (used on logout). */
export const revokeTokens = async (): Promise<void> => {
  try {
    const token = await getAuthToken();
    const refreshToken = await secureGetItem(AUTH_REFRESH_TOKEN_KEY);
    if (token || refreshToken) {
      await api.post('/auth/logout', {
        token: token ?? undefined,
        refresh_token: refreshToken ?? undefined,
      }).catch(() => {});
    }
  } catch {
    // Best-effort revoke; local state is cleared regardless.
  }
};

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: ENV.API_TIMEOUT,
});

api.interceptors.request.use(async config => {
  const token = await getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const url = typeof error.config?.url === 'string' ? error.config.url : '';
    const isLoginRequest = url.includes('/auth/login');
    const isRefreshRequest = url.includes('/auth/refresh-token');
    const retriedConfig = error.config as (InternalAxiosRequestConfig & { _refreshed?: boolean }) | undefined;
    const alreadyRetried = Boolean(retriedConfig?._refreshed);

    if (status === 401 && !isLoginRequest && !isRefreshRequest && !alreadyRetried) {
      if (retriedConfig) retriedConfig._refreshed = true;
      const refreshed = await attemptTokenRefresh();
      if (refreshed && retriedConfig) {
        retriedConfig.headers.Authorization = `Bearer ${authToken}`;
        return api.request(retriedConfig);
      }
      // Refresh failed: revoke server-side and clear local state.
      await revokeTokens();
      authToken = null;
      authTokenExp = null;
      await secureMultiDelete([AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY]).catch(() => {});
      onAuthFailure?.();
    }
    return Promise.reject(error);
  }
);

export const login = (employeeId: string, password: string): Promise<AxiosResponse<Employee>> =>
  api.post('/auth/login', { employee_id: employeeId, password });

export const requestPasswordReset = (identifier: string): Promise<AxiosResponse<{ message: string }>> =>
  api.post('/auth/forgot-password/request', { identifier });

export const resetPasswordWithOtp = (identifier: string, otp: string, newPassword: string): Promise<AxiosResponse<{ message: string }>> =>
  api.post('/auth/forgot-password/reset', { identifier, otp, new_password: newPassword });

export const getTodayAttendance = (date: string): Promise<AxiosResponse<{ roster: AttendanceRecord[]; summary: Record<string, number> }>> =>
  api.get('/attendance', { params: { date } });

export const confirmAttendance = (formData: FormData): Promise<AxiosResponse<{ message: string; photo_path: string | null; latitude: number | null; longitude: number | null }>> =>
  api.post('/attendance/confirm', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });

export const clockOut = (data: { person_type: string; person_id: string; date: string; time: string }): Promise<AxiosResponse<{ message: string }>> =>
  api.post('/attendance/clock-out', data);

export const getPersonAttendance = (personId: string, limit: number = 30): Promise<AxiosResponse<AttendanceRecord[]>> =>
  api.get(`/attendance/person/${personId}`, { params: { limit } });

export const getPersonAttendanceSummary = (personId: string): Promise<AxiosResponse<AttendanceSummary>> =>
  api.get(`/attendance/person/${personId}/summary`);

export const getSettings = (): Promise<AxiosResponse<Settings>> =>
  api.get('/settings');

export const attendancePhotoUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${HOST}${path}`;
  const filename = path.split(/[/\\]/).pop();
  return `${HOST}/uploads/attendance/${filename}`;
};

export const profilePhotoUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${HOST}${path}`;
  const filename = path.split(/[/\\]/).pop();
  return `${HOST}/uploads/profiles/${filename}`;
};

export const getMyTasks = (personId: string, personType: string = 'employee'): Promise<AxiosResponse<Task[]>> =>
  api.get(`/tasks/person/${personId}`, { params: { type: personType } });

/** Company-wide projects with team lead, members and progress (read-only). */
export const getProjects = (search?: string, status?: string): Promise<AxiosResponse<Project[]>> =>
  api.get('/projects', { params: { search, status } });

/** A single project's full details (confidential projects may 404 for interns). */
export const getProject = (projectId: string): Promise<AxiosResponse<Project>> =>
  api.get(`/projects/${projectId}`);

/** Project lead updates status/progress; the server enforces the lead check. */
export const updateProjectStatus = (
  projectId: string,
  status: string,
  progress: number
): Promise<AxiosResponse<{ message: string; status: string; progress: number }>> =>
  api.put(`/projects/${projectId}/status`, { status, progress });

/** Project lead (or admin) replaces the project's team member list. */
export const updateProjectMembers = (
  projectId: string,
  members: { person_id: string; person_type: PersonType }[]
): Promise<AxiosResponse<{ message: string; members: { person_id: string; person_type: PersonType }[] }>> =>
  api.put(`/projects/${projectId}/members`, { members });

export interface NewProjectTaskInput {
  title: string;
  description?: string;
  assigned_to: string;
  assigned_type: PersonType;
  priority?: 'High' | 'Medium' | 'Low';
  deadline?: string;
}

/** Project lead (or admin) assigns a task to one of the project's members. */
export const createProjectTask = (
  projectId: string,
  payload: NewProjectTaskInput
): Promise<AxiosResponse<{ _id: string }>> =>
  api.post(`/projects/${projectId}/tasks`, payload);

/**
 * Upcoming employee birthdays. The backend only ever returns the next
 * occurrence of each birthday within `days` of today.
 */
export const getUpcomingBirthdays = (days: number = 30): Promise<AxiosResponse<BirthdayEntry[]>> =>
  api.get('/employees/birthdays', { params: { days } });

export const getPersonalCalendar = (
  personId: string,
  personType: string = 'employee'
): Promise<AxiosResponse<PersonalCalendarItem[]>> =>
  api.get('/personal-calendar', { params: { person_id: personId, person_type: personType } });

export const createPersonalCalendarItem = (
  payload: { title: string; notes?: string; date: string }
): Promise<AxiosResponse<PersonalCalendarItem>> =>
  api.post('/personal-calendar', payload);

export const updatePersonalCalendarItem = (
  itemId: string,
  payload: { title: string; notes?: string; date: string }
): Promise<AxiosResponse<{ message: string }>> =>
  api.put(`/personal-calendar/${itemId}`, payload);

export const deletePersonalCalendarItem = (
  itemId: string
): Promise<AxiosResponse<{ message: string }>> =>
  api.delete(`/personal-calendar/${itemId}`);

export const getAnnouncements = (): Promise<AxiosResponse<{ announcement: string; topic?: string; announcements?: Announcement[] }>> =>
  api.get('/announcements');

export const getAnnouncementPermission = (
  personId?: string,
  personType: string = 'employee'
): Promise<AxiosResponse<{ can_send: boolean }>> =>
  api.get('/announcements/permission', {
    params: personId ? { person_id: personId, person_type: personType } : undefined,
  });

export const sendAnnouncement = (
  topic: string,
  content: string,
  personId?: string,
  personType: string = 'employee'
): Promise<AxiosResponse<{ message: string; announcement?: Announcement }>> =>
  api.post('/announcements', { topic, content, person_id: personId, person_type: personType });

export const deleteAnnouncement = (
  announcementId: string
): Promise<AxiosResponse<{ message: string }>> =>
  api.delete(`/announcements/${announcementId}`);

export const updateAnnouncement = (
  announcementId: string,
  payload: { topic: string; content: string }
): Promise<AxiosResponse<{ message: string; announcement?: Announcement }>> =>
  api.put(`/announcements/${announcementId}`, payload);

export const updatePushToken = (pushToken: string, employeeId: string, personType: string = 'employee'): Promise<AxiosResponse<{ status: string }>> =>
  api.post('/update-push-token', { pushToken, employeeId, personType });

/** The signed-in person's server-backed notification inbox (newest first). */
export const getNotifications = (
  personId: string,
  personType: string = 'employee'
): Promise<AxiosResponse<{ notifications: ServerNotification[]; unread: number }>> =>
  api.get('/notifications', { params: { person_id: personId, person_type: personType } });

export const markNotificationRead = (
  id: string,
  personId: string,
  personType: string = 'employee'
): Promise<AxiosResponse<{ message: string; updated: boolean }>> =>
  api.post(`/notifications/${id}/read`, null, { params: { person_id: personId, person_type: personType } });

export const markAllNotificationsRead = (
  personId: string,
  personType: string = 'employee'
): Promise<AxiosResponse<{ message: string; updated: number }>> =>
  api.post('/notifications/read-all', null, { params: { person_id: personId, person_type: personType } });

export const deleteNotification = (
  id: string,
  personId: string,
  personType: string = 'employee'
): Promise<AxiosResponse<{ message: string; deleted: boolean }>> =>
  api.delete(`/notifications/${id}`, { params: { person_id: personId, person_type: personType } });

export const updateTaskStatus = (taskId: string, status: TaskStatus): Promise<AxiosResponse<{ message: string }>> =>
  api.put(`/tasks/${taskId}`, { status });

export const addTaskComment = (
  taskId: string,
  comment: { body: string; author: string; author_type: string }
): Promise<AxiosResponse<{ task: Task }>> => api.post(`/tasks/${taskId}/comments`, comment);

export const submitLeaveRequest = (leaveType: string, startDate: string, endDate: string, personId: string, personType: string = 'employee', reason: string = ''): Promise<AxiosResponse<{ message: string; leave_request?: LeaveRequest }>> =>
  api.post('/leave', { leave_type: leaveType, start_date: startDate, end_date: endDate, person_id: personId, person_type: personType, reason });

/** Leave requests submitted by the signed-in person (newest first). */
export const getMyLeaveRequests = (personId: string, personType: string = 'employee'): Promise<AxiosResponse<{ requests: LeaveRequest[]; total: number }>> =>
  api.get('/leave', { params: { person_id: personId, person_type: personType } });

/** Submit (or update) today's work-progress report. */
export const submitReport = (
  payload: { date?: string; content: string; tasks_done?: string[]; hours?: number }
): Promise<AxiosResponse<{ message: string; report: DailyReport }>> =>
  api.post('/reports', payload);

/** The signed-in person's daily work reports (newest first). */
export const getMyReports = (
  personId: string,
  personType: string = 'employee'
): Promise<AxiosResponse<{ reports: DailyReport[] }>> =>
  api.get('/reports/mine', { params: { person_id: personId, person_type: personType } });

export const getDocuments = (search?: string): Promise<AxiosResponse<EmployeeDocument[]>> =>
  api.get('/documents', { params: search ? { search } : undefined });

export const getDocumentCategories = (): Promise<AxiosResponse<string[]>> =>
  api.get('/documents/categories');

export const uploadDocument = (formData: FormData, onProgress?: (progress: number) => void): Promise<AxiosResponse<{ _id: string; file_name: string }>> =>
  api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
    onUploadProgress: event => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });

export const documentUrl = (documentId: string): string => `${HOST}/api/documents/${documentId}/download`;

/** Raw shape returned by the people endpoints. Only safe fields are read. */
export interface RawPersonRecord {
  _id: string;
  name?: string;
  employee_id?: string;
  intern_id?: string;
  department?: string;
  designation?: string;
  status?: string;
  email?: string;
  phone?: string;
  photo_path?: string;
  joining_date?: string;
  college?: string;
  created_at?: string;
}

export const getEmployees = (search?: string): Promise<AxiosResponse<RawPersonRecord[]>> =>
  api.get('/employees', { params: search ? { search } : undefined });

export const getInterns = (search?: string): Promise<AxiosResponse<RawPersonRecord[]>> =>
  api.get('/interns', { params: search ? { search } : undefined });

export const getEmployeeById = (employeeId: string): Promise<AxiosResponse<RawPersonRecord>> =>
  api.get(`/employees/${employeeId}`);

export const updatePersonProfile = (
  personId: string,
  personType: PersonType,
  data: { name?: string; phone?: string; email?: string; photo_path?: string }
): Promise<AxiosResponse<{ message: string }>> =>
  personType === 'intern'
    ? api.put(`/interns/${personId}`, data)
    : api.put(`/employees/${personId}`, data);

export const changePassword = (
  employeeId: string,
  personType: PersonType,
  oldPassword: string,
  newPassword: string
): Promise<AxiosResponse<{ message: string }>> =>
  api.post('/auth/change-password', {
    employee_id: employeeId,
    person_type: personType,
    old_password: oldPassword,
    new_password: newPassword,
  });

export const uploadProfilePhoto = (formData: FormData): Promise<AxiosResponse<{ photo_path: string }>> =>
  api.post('/upload/profile', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });

/* ------------------------------ Help desk / support ------------------------------ */

export interface SupportRequestQuery {
  personId: string;
  personType?: string;
  status?: string;
  category?: string;
  search?: string;
  limit?: number;
  skip?: number;
}

const MULTIPART_HEADERS = { 'Content-Type': 'multipart/form-data' };

function uploadProgressHandler(onProgress?: (progress: number) => void) {
  if (!onProgress) return undefined;
  return (event: AxiosProgressEvent): void => {
    if (event.total) onProgress(Math.round((event.loaded / event.total) * 100));
  };
}

export const getSupportCategories = (): Promise<AxiosResponse<string[]>> =>
  api.get('/support/categories');

export const getSupportRequests = (
  query: SupportRequestQuery
): Promise<AxiosResponse<SupportRequestListResponse>> => {
  const params: Record<string, string | number> = { person_id: query.personId };
  if (query.personType) params.person_type = query.personType;
  if (query.status) params.status = query.status;
  if (query.category) params.category = query.category;
  if (query.search) params.search = query.search;
  if (typeof query.limit === 'number') params.limit = query.limit;
  if (typeof query.skip === 'number') params.skip = query.skip;
  return api.get('/support/requests', { params });
};

export const createSupportRequest = (
  formData: FormData,
  onProgress?: (progress: number) => void
): Promise<AxiosResponse<{ ticket: SupportTicket }>> =>
  api.post('/support/requests', formData, {
    headers: MULTIPART_HEADERS,
    timeout: 60000,
    onUploadProgress: uploadProgressHandler(onProgress),
  });

export const getSupportTicket = (
  ticketId: string,
  personId: string
): Promise<AxiosResponse<SupportTicket>> =>
  api.get(`/support/requests/${ticketId}`, { params: { person_id: personId } });

export const addSupportResponse = (
  ticketId: string,
  formData: FormData,
  onProgress?: (progress: number) => void
): Promise<AxiosResponse<{ ticket: SupportTicket }>> =>
  api.post(`/support/requests/${ticketId}/responses`, formData, {
    headers: MULTIPART_HEADERS,
    timeout: 60000,
    onUploadProgress: uploadProgressHandler(onProgress),
  });

export const cancelSupportRequest = (
  ticketId: string,
  personId: string
): Promise<AxiosResponse<{ ticket: SupportTicket }>> =>
  api.post(`/support/requests/${ticketId}/cancel`, { person_id: personId });

export const reopenSupportRequest = (
  ticketId: string,
  personId: string
): Promise<AxiosResponse<{ ticket: SupportTicket }>> =>
  api.post(`/support/requests/${ticketId}/reopen`, { person_id: personId });

export const confirmSupportResolution = (
  ticketId: string,
  personId: string
): Promise<AxiosResponse<{ ticket: SupportTicket }>> =>
  api.post(`/support/requests/${ticketId}/confirm-resolution`, { person_id: personId });

export const supportAttachmentUrl = (attachmentId: string): string =>
  `${HOST}/api/support/attachments/${attachmentId}/download`;

export default api;