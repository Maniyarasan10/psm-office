import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Employee } from '../types';
import { RECENT_SEARCHES_STORAGE_KEY } from '../hooks/useRecentSearches';
import { setAuthToken, clearAuthToken, AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY, setOnAuthFailure, getAuthToken } from '../services/api';
import { clearOfflineCache } from '../services/offlineCache';

interface AuthContextType {
  employee: Employee | null;
  personType: string;
  login: (empData: Employee) => Promise<void>;
  updateEmployee: (patch: Partial<Employee>) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  employee: null,
  personType: 'employee',
  login: async () => {},
  updateEmployee: async () => {},
  logout: async () => {},
  loading: true,
});

const EMPLOYEE_STORAGE_KEY = 'psm_employee';

// Only these fields are ever persisted; anything else on the payload
// (notes, timestamps, unknown extras) never touches disk.
function sanitizeEmployee(emp: Employee): Employee {
  const {
    _id,
    employee_id,
    name,
    person_type,
    department,
    designation,
    phone,
    email,
    status,
    photo_path,
    college,
  } = emp;
  return {
    _id,
    employee_id,
    name,
    person_type,
    department,
    designation,
    phone,
    email,
    status,
    photo_path,
    college,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadStored();
    setOnAuthFailure(() => {
      void logout();
    });
    return () => {
      setOnAuthFailure(null);
    };
  }, []);

  const loadStored = async () => {
    try {
      const stored = await AsyncStorage.getItem(EMPLOYEE_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Employee | null;
          if (parsed && typeof parsed === 'object' && typeof parsed._id === 'string') {
            setEmployee(sanitizeEmployee(parsed));
          } else {
            await AsyncStorage.removeItem(EMPLOYEE_STORAGE_KEY);
            setEmployee(null);
          }
        } catch (parseErr) {
          console.error('Failed to parse stored auth:', parseErr);
          await AsyncStorage.removeItem(EMPLOYEE_STORAGE_KEY);
          setEmployee(null);
        }
      }
    } catch (err) {
      console.error('Failed to load auth:', err);
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (empData: Employee) => {
    try {
      const clean = sanitizeEmployee(empData);
      let token = empData.token || null;
      let refreshToken = empData.refresh_token || null;

      if (!token) {
        try {
          token = await getAuthToken();
        } catch {
          token = null;
        }
      }
      if (!refreshToken) {
        try {
          refreshToken = await AsyncStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
        } catch {
          refreshToken = null;
        }
      }

      setEmployee(clean);
      setAuthToken(token);
      await AsyncStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(clean));
      if (token) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      }
      if (refreshToken) {
        await AsyncStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
      }
    } catch (err) {
      console.error('Failed to save auth:', err);
    }
  };

  // Merge a server-confirmed profile update into the signed-in employee without
  // touching the stored session tokens. Used by self-service profile edits.
  const updateEmployee = async (patch: Partial<Employee>) => {
    try {
      setEmployee(current => {
        if (!current) return current;
        const next = sanitizeEmployee({ ...current, ...patch });
        void AsyncStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(next)).catch(err => {
          console.error('Failed to persist profile update:', err);
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to update employee:', err);
    }
  };

  const logout = async () => {
    try {
      setEmployee(null);
      clearAuthToken();
      await AsyncStorage.multiRemove([EMPLOYEE_STORAGE_KEY, RECENT_SEARCHES_STORAGE_KEY, AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY]);
      clearOfflineCache();
    } catch (err) {
      console.error('Failed to clear auth:', err);
    }
  };

  const personType = employee?.person_type || 'employee';

  return (
    <AuthContext.Provider value={{ employee, personType, login, updateEmployee, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
