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
      return parsed;
    } catch {
      return null;
    }
  });

  const login = async (username, password) => {
    const res = await api.post('/auth/admin-login', { username, password });
    const userData = res.data || {};
    // Tokens are set as HttpOnly cookies by the backend; the browser sends them
    // automatically with every request (withCredentials: true). Never persist
    // tokens in localStorage; keep display metadata only.
    const { token, refresh_token, ...safeUser } = userData;
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
