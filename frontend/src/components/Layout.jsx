import { useState, useEffect, useMemo, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { profilePhotoUrl, getAdminNotifications } from '../services/services';
import {
  HiOutlineViewGrid,
  HiOutlineUsers,
  HiOutlineUserGroup,
  HiOutlineClipboardCheck,
  HiOutlineBriefcase,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlineFolder,
  HiOutlineCurrencyDollar,
  HiOutlineChartBar,
  HiOutlineSpeakerphone,
  HiOutlineBell,
  HiOutlineCog,
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineMenu,
  HiOutlineLogout,
} from 'react-icons/hi';

const navItems = [
  { to: '/', label: 'Dashboard', icon: HiOutlineViewGrid },
  { to: '/employees', label: 'Employees', icon: HiOutlineUsers },
  { to: '/interns', label: 'Interns', icon: HiOutlineUserGroup },
  { to: '/attendance', label: 'Attendance', icon: HiOutlineClipboardCheck },
  { to: '/leave', label: 'Leave', icon: HiOutlineCalendar },
  { to: '/tasks', label: 'Tasks', icon: HiOutlineDocumentText },
  { to: '/projects', label: 'Projects', icon: HiOutlineBriefcase },
  { to: '/documents', label: 'Company Files', icon: HiOutlineFolder },
  { to: '/finance', label: 'Finance', icon: HiOutlineCurrencyDollar },
  { to: '/reports', label: 'Reports', icon: HiOutlineChartBar },
  { to: '/announcements', label: 'Announcements', icon: HiOutlineSpeakerphone },
  { to: '/notifications', label: 'Notifications', icon: HiOutlineBell },
  { to: '/settings', label: 'Settings', icon: HiOutlineCog },
];

const SEEN_STORAGE_KEY = 'psm-admin-seen';

const parseTime = (value) => {
  if (!value) return 0;
  let normalized = String(value);
  if (/\.\d{3}\d+$/.test(normalized)) {
    normalized = normalized.replace(/(\.\d{3})\d+$/, '$1');
  }
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const readSeenMap = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
};

const pageTitles = {
  '/': { title: 'Dashboard', subtitle: 'Welcome back! Here is your office overview.' },
  '/employees': { title: 'Employees', subtitle: 'Manage employee records and information.' },
  '/interns': { title: 'Interns', subtitle: 'Track intern details and mentorship.' },
  '/attendance': { title: 'Attendance', subtitle: 'Mark and track daily attendance.' },
  '/leave': { title: 'Leave', subtitle: 'Review and approve leave requests.' },
  '/tasks': { title: 'Tasks', subtitle: 'Create and manage office tasks.' },
  '/projects': { title: 'Projects', subtitle: 'Assign projects, team leads and members.' },
  '/documents': { title: 'Company Files', subtitle: 'Manage company documents and files.' },
  '/finance': { title: 'Finance', subtitle: 'Track income, expenses and transactions.' },
  '/reports': { title: 'Reports', subtitle: 'Generate and export office reports.' },
  '/announcements': { title: 'Announcements', subtitle: 'Manage who can send announcements and publish updates.' },
  '/notifications': { title: 'Custom Notifications', subtitle: 'Send a notification to everyone or select specific employees and interns.' },
  '/settings': { title: 'Settings', subtitle: 'Configure company and app settings.' },
};

export default function Layout() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activity, setActivity] = useState([]);
  const [seenMap, setSeenMap] = useState(readSeenMap);
  const pageInfo = pageTitles[location.pathname] || pageTitles['/'];
  const profileImage = user?.photo_path ? profilePhotoUrl(user.photo_path) : '/fin.png';
  const profileName = user?.name || user?.username || 'Administrator';

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const persistSeen = useCallback((next) => {
    setSeenMap(next);
    try {
      localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const { data } = await getAdminNotifications(100);
      if (Array.isArray(data)) {
        setActivity(data);
        let hasSeenStore = true;
        try {
          hasSeenStore = localStorage.getItem(SEEN_STORAGE_KEY) !== null;
        } catch {
          hasSeenStore = false;
        }
        if (!hasSeenStore) {
          const now = new Date().toISOString();
          const baseline = {};
          navItems.forEach((item) => { baseline[item.to] = now; });
          persistSeen(baseline);
        }
      }
    } catch {
      // Keep the last known activity; sidebar badges simply stay as they are.
    }
  }, [persistSeen]);

  useEffect(() => {
    loadActivity();
    const timer = setInterval(loadActivity, 30000);
    return () => clearInterval(timer);
  }, [loadActivity]);

  const markRouteSeen = useCallback((route) => {
    if (!route) return;
    setSeenMap((prev) => {
      const next = { ...prev, [route]: new Date().toISOString() };
      try {
        localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const isUnread = useCallback(
    (item) => {
      if (!item?.route) return false;
      const seenAt = parseTime(seenMap[item.route]);
      return parseTime(item.timestamp) > seenAt;
    },
    [seenMap]
  );

  const unreadByRoute = useMemo(() => {
    const counts = {};
    activity.forEach((item) => {
      if (item.route && isUnread(item)) {
        counts[item.route] = (counts[item.route] || 0) + 1;
      }
    });
    return counts;
  }, [activity, isUnread]);

  return (
    <div className="app-layout">
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-frame">
            <img src="/fin.png" alt="PSM" className="sidebar-logo-image" />
          </div>
          <h1 style={{ fontSize: 14, marginTop: 0 }}>Office Manager</h1>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' active' : ''}`
              }
              onClick={() => {
                setSidebarOpen(false);
                markRouteSeen(item.to);
              }}
            >
              <item.icon />
              <span>{item.label}</span>
              {unreadByRoute[item.to] > 0 && (
                <span className="sidebar-badge">
                  {unreadByRoute[item.to] > 99 ? '99+' : unreadByRoute[item.to]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <button
              className="menu-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <HiOutlineMenu size={20} />
            </button>
            <div className="header-titles">
              <div className="header-title">{pageInfo.title}</div>
              <div className="header-subtitle">{pageInfo.subtitle}</div>
            </div>
          </div>
          <div className="header-right">
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
              {theme === 'light' ? <HiOutlineMoon size={18} /> : <HiOutlineSun size={18} />}
            </button>
            <div className="header-profile-wrap">
              <button
                className="header-profile"
                onClick={() => {
                  setShowProfileMenu((prev) => !prev);
                }}
                title={profileName}
              >
                {profileImage ? (
                  <img src={profileImage} alt={profileName} className="header-profile-image" />
                ) : (
                  <span className="header-profile-initial">{profileName.charAt(0).toUpperCase()}</span>
                )}
              </button>
              {showProfileMenu && (
                <div className="header-profile-menu">
                  <div className="header-profile-summary">
                    {profileImage ? (
                      <img src={profileImage} alt={profileName} className="header-profile-image header-profile-image-large" />
                    ) : (
                      <span className="header-profile-initial header-profile-initial-large">{profileName.charAt(0).toUpperCase()}</span>
                    )}
                    <div>
                      <div className="header-profile-name">{profileName}</div>
                      <div className="header-profile-role">Administrator</div>
                    </div>
                  </div>
                  <button
                    className="header-profile-logout"
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                  >
                    <HiOutlineLogout size={16} />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
