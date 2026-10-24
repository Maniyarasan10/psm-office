import { createContext, useContext, useState } from 'react';
import api from '../services/services';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('psm-admin');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Clean up tokens persisted by older builds.
      if (parsed && (parsed.token || parsed.refresh_token)) {
        delete parsed.token;
        delete parsed.refresh_token;
        localStorage.setItem('psm-admin', JSON.stringify(parsed));
      }
      // Restore the Bearer header from the persisted access token so the
      // session survives page refreshes without relying on HttpOnly cookies
      // (which do not reliably round-trip through the Netlify -> Heroku proxy).
      const token = localStorage.getItem('psm-admin-token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const login = async (username, password) => {
    const res = await api.post('/auth/admin-login', { username, password });
    const userData = res.data || {};
    // Tokens are set as HttpOnly cookies by the backend. Persist the access
    // token in localStorage and attach it as a Bearer header so requests work
    // reliably through the Netlify -> Heroku proxy and survive page refreshes.
    const { token, refresh_token, ...safeUser } = userData;
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      try {
        localStorage.setItem('psm-admin-token', token);
      } catch {
        // ignore
      }
    }
    setUser(safeUser);
    try {
      localStorage.setItem('psm-admin', JSON.stringify(safeUser));
    } catch {
      // ignore
    }
    return safeUser;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    delete api.defaults.headers.common['Authorization'];
    try {
      localStorage.removeItem('psm-admin-token');
    } catch {
      // ignore
    }
    setUser(null);
    try {
      localStorage.removeItem('psm-admin');
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
