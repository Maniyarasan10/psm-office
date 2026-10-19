import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoadingScreen from './components/LoadingScreen';
import BottomNav from './components/BottomNav';
import Login from './pages/Login';
import Home from './pages/Home';
import MarkAttendance from './pages/MarkAttendance';
import History from './pages/History';
import Tasks from './pages/Tasks';

function ProtectedRoute({ children }) {
  const { employee, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!employee) return <Navigate to="/login" replace />;
  return children;
}

function TabLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

function AppRoutes() {
  return (
    <div className="app-bg">
      <div className="app-shell">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TabLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="tasks" element={<Tasks />} />
          </Route>
          <Route
            path="/mark"
            element={
              <ProtectedRoute>
                <MarkAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
