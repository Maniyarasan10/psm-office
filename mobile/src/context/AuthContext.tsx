import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { secureGetItem, secureSetItem, secureDeleteItem, secureMultiDelete } from '../services/secureStorage';
import { Employee } from '../types';
import { RECENT_SEARCHES_STORAGE_KEY } from '../hooks/useRecentSearches';
import { setAuthToken, clearAuthToken, AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY, setOnAuthFailure, getAuthToken, isTokenValid, revokeTokens } from '../services/api';
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
      const stored = await secureGetItem(EMPLOYEE_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Employee | null;
          if (parsed && typeof parsed === 'object' && typeof parsed._id === 'string') {
            setEmployee(sanitizeEmployee(parsed));
          } else {
            await secureDeleteItem(EMPLOYEE_STORAGE_KEY);
            setEmployee(null);
          }
        } catch (parseErr) {
          await secureDeleteItem(EMPLOYEE_STORAGE_KEY);
          setEmployee(null);
        }
      }
    } catch (err) {
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
          refreshToken = await secureGetItem(AUTH_REFRESH_TOKEN_KEY);
        } catch {
          refreshToken = null;
        }
      }

      setEmployee(clean);
      setAuthToken(token);
      await secureSetItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(clean));
      if (token) {
        await secureSetItem(AUTH_TOKEN_KEY, token);
      }
      if (refreshToken) {
        await secureSetItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
      }
    } catch (err) {
      // Storage failure is non-fatal; session continues in memory only.
    }
  };

  // Merge a server-confirmed profile update into the signed-in employee without
  // touching the stored session tokens. Used by self-service profile edits.
  const updateEmployee = async (patch: Partial<Employee>) => {
    try {
      setEmployee(current => {
        if (!current) return current;
        const next = sanitizeEmployee({ ...current, ...patch });
        void secureSetItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    } catch (err) {
      console.error('Failed to update employee:', err);
    }
  };

  const logout = async () => {
    try {
      // Revoke tokens server-side so they cannot be reused after logout.
      await revokeTokens().catch(() => {});
      setEmployee(null);
      clearAuthToken();
      await secureMultiDelete([EMPLOYEE_STORAGE_KEY, RECENT_SEARCHES_STORAGE_KEY, AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY]);
      clearOfflineCache();
    } catch {
      // Logout should not throw; local state is cleared regardless.
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
