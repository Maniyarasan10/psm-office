import axios from 'axios';
import API_BASE from './api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  // Send/receive the HttpOnly auth cookie set by the backend.
  withCredentials: true,
});

let isRefreshing = false;
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    const isLoginRequest = config?.url?.includes('/auth/admin-login');
    const isRefreshRequest = config?.url?.includes('/auth/refresh-token');

    // Never refresh on login or refresh-endpoint requests themselves.
    if (response?.status === 401 && !isLoginRequest && !isRefreshRequest) {
      // If a refresh is already in flight, wait for it and retry once.
      if (isRefreshing) {
        if (!refreshPromise) return Promise.reject(error);
        try {
          await refreshPromise;
          config.headers.Authorization = undefined;
          return api.request(config);
        } catch {
          return Promise.reject(error);
        }
      }

      isRefreshing = true;
      refreshPromise = (async () => {
        try {
          // The browser sends the HttpOnly psm_refresh cookie automatically;
          // the backend mints a new access token and sets it as a cookie.
          await api.post('/api/auth/refresh-token');
        } finally {
          isRefreshing = false;
          refreshPromise = null;
        }
      })();

      try {
        await refreshPromise;
        config.headers.Authorization = undefined;
        return api.request(config);
      } catch {
        // Refresh failed: clear session and send to login.
        try {
          localStorage.removeItem('psm-admin');
        } catch {
          // ignore
        }
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login');
        }
        return Promise.reject(error);
      }
    }

    if (response?.status === 401 && !isLoginRequest) {
      try {
        localStorage.removeItem('psm-admin');
      } catch {
        // ignore
      }
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export const getEmployees = (search) =>
  api.get('/employees', { params: { search } });

export const getNextEmployeeId = () =>
  api.get('/employees/next-id');

export const createEmployee = (data) =>
  api.post('/employees', data);

export const updateEmployee = (id, data) =>
  api.put(`/employees/${id}`, data);

export const deleteEmployee = (id) =>
  api.delete(`/employees/${id}`);

export const getInterns = (search) =>
  api.get('/interns', { params: { search } });

export const getNextInternId = () =>
  api.get('/interns/next-id');

export const createIntern = (data) =>
  api.post('/interns', data);

export const updateIntern = (id, data) =>
  api.put(`/interns/${id}`, data);

export const deleteIntern = (id) =>
  api.delete(`/interns/${id}`);

export const sendPasswordResetOtp = (identifier) =>
  api.post('/auth/send-reset-otp', { identifier });

export const uploadProfilePhoto = (fileOrFormData) => {
  const formData = fileOrFormData instanceof FormData
    ? fileOrFormData
    : (() => {
        const fd = new FormData();
        fd.append('photo', fileOrFormData);
        return fd;
      })();

  return api.post('/upload/profile', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

const HOST = API_BASE.replace(/\/api\/?$/, '');

export const profilePhotoUrl = (path) => {
  if (!path) return null;
  if (typeof path !== 'string') return null;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/uploads/') || path.startsWith('/api/photo/')) return `${HOST}${path}`;
  if (path.startsWith('/')) return path;
  if (path.includes('/uploads/') || path.includes('uploads/')) {
    return `${HOST}${path.startsWith('/') ? '' : '/'}${path}`;
  }
  const filename = path.split(/[/\\]/).pop();
  return `${HOST}/uploads/profiles/${filename}`;
};

export const getAttendance = (date) =>
  api.get('/attendance', { params: { date } });

export const markAttendance = (data) =>
  api.post('/attendance/mark', data);

export const clockIn = (data) =>
  api.post('/attendance/clock-in', data);

export const clockOut = (data) =>
  api.post('/attendance/clock-out', data);

export const setAttendanceStatus = (data) =>
  api.post('/attendance/status', data);

export const attendancePhotoUrl = (path) => {
  if (!path) return null;
  if (typeof path !== 'string') return null;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/uploads/') || path.startsWith('/api/photo/')) return `${HOST}${path}`;
  if (path.startsWith('/')) return `${HOST}${path}`;
  const filename = path.split(/[/\\]/).pop();
  return `${HOST}/uploads/attendance/${filename}`;
};

export const getPersonAttendanceSummary = (personId) =>
  api.get(`/attendance/person/${personId}/summary`);

export const getAttendanceReport = (startDate, endDate) =>
  api.get('/attendance/report', { params: { start_date: startDate, end_date: endDate } });

export const getDocuments = (search, category) =>
  api.get('/documents', { params: { search, category } });

export const uploadDocument = (formData) =>
  api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const renameDocument = (id, data) =>
  api.put(`/documents/${id}/rename`, data);

export const updateDocumentVisibility = (id, data) =>
  api.put(`/documents/${id}/visibility`, data);

export const deleteDocument = (id) =>
  api.delete(`/documents/${id}`);

export const downloadDocument = (id) =>
  api.get(`/documents/${id}/download`, { responseType: 'blob' });

/**
 * Direct link to a stored file. The API answers with a redirect to the
 * Cloudinary CDN URL, so opening it in a tab starts the download.
 */
export const downloadDocumentUrl = (id) =>
  `${HOST}/api/documents/${id}/download`;

export const getDocumentCategories = () =>
  api.get('/documents/categories');

export const getFinance = (search) =>
  api.get('/finance', { params: { search } });

export const createFinance = (data) =>
  api.post('/finance', data);

export const updateFinance = (id, data) =>
  api.put(`/finance/${id}`, data);

export const deleteFinance = (id) =>
  api.delete(`/finance/${id}`);

export const getFinanceSummary = () =>
  api.get('/finance/summary');

export const getTasks = (search) =>
  api.get('/tasks', { params: { search } });

export const createTask = (data) =>
  api.post('/tasks', data);

export const updateTask = (id, data) =>
  api.put(`/tasks/${id}`, data);

export const deleteTask = (id) =>
  api.delete(`/tasks/${id}`);

export const addTaskComment = (taskId, data) =>
  api.post(`/tasks/${taskId}/comments`, data);

export const getProjects = (search, status) =>
  api.get('/projects', { params: { search, status } });

export const createProject = (data) =>
  api.post('/projects', data);

export const updateProject = (id, data) =>
  api.put(`/projects/${id}`, data);

export const deleteProject = (id) =>
  api.delete(`/projects/${id}`);

export const getDashboard = () =>
  api.get('/dashboard');

export const saveNote = (data) =>
  api.post('/notes', data);

export const getLeaveRequests = (params) =>
  api.get('/leave', { params });

export const getSupportRequests = (params) =>
  api.get('/support/requests', { params });

export const getSupportTicket = (ticketId) =>
  api.get(`/support/requests/${ticketId}`);

export const updateSupportStatus = (ticketId, status) =>
  api.put(`/support/requests/${ticketId}/status`, { status });

export const updateSupportPriority = (ticketId, priority) =>
  api.put(`/support/requests/${ticketId}/priority`, { priority });

export const addSupportResponse = (ticketId, formData) =>
  api.post(`/support/requests/${ticketId}/responses`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const getLeaveStats = () =>
  api.get('/leave/stats');

export const approveLeave = (id, note) =>
  api.post(`/leave/${id}/approve`, { note });

export const rejectLeave = (id, note) =>
  api.post(`/leave/${id}/reject`, { note });

export const getAnnouncement = () =>
  api.get('/announcements');

export const saveAnnouncement = (data) =>
  api.post('/announcements', data);

export const deleteAnnouncement = (id) =>
  api.delete(`/announcements/${id}`);

export const getAdminNotifications = (limit = 100) =>
  api.get('/notifications/activity', { params: { limit } });

export const sendCustomNotification = (data) =>
  api.post('/notifications/send', data);

export const getCustomNotificationLog = () =>
  api.get('/notifications/sent');

export const getAnnouncementSenders = () =>
  api.get('/announcement-senders');

export const updateAnnouncementSenders = (senders) =>
  api.post('/announcement-senders', { senders });

export const getSettings = () =>
  api.get('/settings');

export const updateSettings = (data) =>
  api.post('/settings', data);

export const createBackup = () =>
  api.post('/backup');

export const listBackups = () =>
  api.get('/backups');

export const downloadBackupUrl = (filename) =>
  `${API_BASE}/backups/${filename}`;

export const restoreBackup = (formData) =>
  api.post('/backup/restore', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const getReport = (reportType, params) =>
  api.get(`/reports/${reportType}`, { params });

export const exportReport = (formatType, params) =>
  api.get(`/reports/export/${formatType}`, { params, responseType: 'blob' });

export default api;
