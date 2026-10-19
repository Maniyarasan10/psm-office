import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(() => {
    try {
      const stored = localStorage.getItem('psm_employee');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const login = (empData) => {
    setEmployee(empData);
    localStorage.setItem('psm_employee', JSON.stringify(empData));
  };

  const logout = () => {
    setEmployee(null);
    localStorage.removeItem('psm_employee');
  };

  const personType = employee?.person_type || 'employee';

  return (
    <AuthContext.Provider value={{ employee, personType, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
