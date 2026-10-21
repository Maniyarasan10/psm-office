import { createContext, useContext, useState } from 'react';
import api, { AUTH_TOKEN_KEY } from '../services/services';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('psm-admin');
    return stored ? JSON.parse(stored) : null;
  });

  const login = async (username, password) => {
    const res = await api.post('/auth/admin-login', { username, password });
    const userData = res.data;
    const token = userData.token || '';
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
    setUser(userData);
    localStorage.setItem('psm-admin', JSON.stringify(userData));
    return userData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('psm-admin');
    localStorage.removeItem(AUTH_TOKEN_KEY);
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
