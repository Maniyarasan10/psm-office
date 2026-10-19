import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Employee } from '../types';
import { RECENT_SEARCHES_STORAGE_KEY } from '../hooks/useRecentSearches';
import { setAuthToken, clearAuthToken, AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY, setOnAuthFailure } from '../services/api';

interface AuthContextType {
  employee: Employee | null;
  personType: string;
  login: (empData: Employee) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  employee: null,
  personType: 'employee',
  login: async () => {},
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
      const token = empData.token || null;
      const refreshToken = empData.refresh_token || null;
      setEmployee(clean);
      setAuthToken(token);
      await AsyncStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(clean));
      if (token) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      }
      if (refreshToken) {
        await AsyncStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
      } else {
        await AsyncStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
      }
    } catch (err) {
      console.error('Failed to save auth:', err);
    }
  };

  const logout = async () => {
    try {
      setEmployee(null);
      clearAuthToken();
      await AsyncStorage.multiRemove([EMPLOYEE_STORAGE_KEY, RECENT_SEARCHES_STORAGE_KEY, AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY]);
    } catch (err) {
      console.error('Failed to clear auth:', err);
    }
  };

  const personType = employee?.person_type || 'employee';

  return (
    <AuthContext.Provider value={{ employee, personType, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
