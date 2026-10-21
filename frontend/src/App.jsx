import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Interns from './pages/Interns';
import Attendance from './pages/Attendance';
import Leave from './pages/Leave';
import Tasks from './pages/Tasks';
import Projects from './pages/Projects';
import Documents from './pages/Documents';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Announcements from './pages/Announcements';
import Settings from './pages/Settings';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="interns" element={<Interns />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leave" element={<Leave />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="projects" element={<Projects />} />
        <Route path="documents" element={<Documents />} />
        <Route path="finance" element={<Finance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;