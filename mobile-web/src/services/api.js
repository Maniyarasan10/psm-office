import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.problemsolvingmind.com/api';
const HOST = API_BASE.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

export const login = (employeeId, password) =>
  api.post('/auth/login', { employee_id: employeeId, password });

export const getTodayAttendance = (date) =>
  api.get('/attendance', { params: { date } });

export const confirmAttendance = (formData) =>
  api.post('/attendance/confirm', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });

export const clockOut = (data) =>
  api.post('/attendance/clock-out', data);

export const getPersonAttendance = (personId, limit = 30) =>
  api.get(`/attendance/person/${personId}`, { params: { limit } });

export const getSettings = () =>
  api.get('/settings');

export const getMyTasks = (personId, personType = 'employee') =>
  api.get(`/tasks/person/${personId}`, { params: { type: personType } });

export const updateTaskStatus = (taskId, status) =>
  api.put(`/tasks/${taskId}`, { status });

export const attendancePhotoUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${HOST}${path}`;
  const filename = path.split(/[/\\]/).pop();
  return `${HOST}/uploads/attendance/${filename}`;
};

export const profilePhotoUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${HOST}${path}`;
  const filename = path.split(/[/\\]/).pop();
  return `${HOST}/uploads/profiles/${filename}`;
};

export const reverseGeocode = async (latitude, longitude) => {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        format: 'jsonv2',
        lat: latitude,
        lon: longitude,
        zoom: 18,
      },
    });
    const data = res.data;
    if (!data || !data.address) return null;
    const a = data.address;
    const formattedAddress =
      [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village || a.county, a.state, a.country]
        .filter(Boolean)
        .join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    return {
      address: a.road || a.neighbourhood || '',
      street: a.road || '',
      city: a.city || a.town || a.village || '',
      region: a.state || '',
      country: a.country || '',
      postalCode: a.postcode || '',
      formattedAddress,
    };
  } catch (err) {
    return null;
  }
};

export default api;
