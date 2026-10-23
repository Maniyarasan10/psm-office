import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiCamera,
  FiClock,
  FiCheckCircle,
  FiRotateCcw,
  FiMapPin,
  FiLogOut,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getTodayAttendance, clockOut, profilePhotoUrl, reverseGeocode } from '../services/api';

const STATUS_COLORS = {
  Present: '#10b981',
  Absent: '#ef4444',
  Late: '#f59e0b',
  Remote: '#3b82f6',
  Office: '#2563eb',
};

function getStatusColor(status) {
  return STATUS_COLORS[status] || '#94a3b8';
}

export default function Home() {
  const navigate = useNavigate();
  const { employee, personType, logout } = useAuth();
  const toast = useToast();
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clockingOut, setClockingOut] = useState(false);
  const [placeDetails, setPlaceDetails] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const loadAttendance = useCallback(async () => {
    try {
      const res = await getTodayAttendance(today);
      const roster = res.data.roster || [];
      const myRecord = roster.find((r) => r.person_id === employee?._id);
      setAttendance(myRecord || null);

      if (myRecord?.latitude != null && myRecord?.longitude != null) {
        const place = await reverseGeocode(myRecord.latitude, myRecord.longitude);
        setPlaceDetails(place);
      } else {
        setPlaceDetails(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [today, employee]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const handleClockIn = () => {
    navigate('/mark');
  };

  const handleClockOut = async () => {
    if (!window.confirm('Are you sure you want to clock out?')) return;
    setClockingOut(true);
    try {
      const time = new Date().toTimeString().slice(0, 5);
      await clockOut({
        person_type: personType,
        person_id: employee._id,
        date: today,
        time,
      });
      toast.success('Clocked out successfully');
      loadAttendance();
    } catch (err) {
      toast.error('Failed to clock out');
    } finally {
      setClockingOut(false);
    }
  };

  const handleLogout = () => {
    setShowMenu(false);
    if (!window.confirm('Are you sure you want to logout?')) return;
    logout();
  };

  const avatarSource = profilePhotoUrl(employee?.photo_path);
  const initials =
    employee?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  const statusColor = attendance ? getStatusColor(attendance.status) : null;

  return (
    <div className="screen">
      <header className="home-header">
        <div className="home-header-left">
          <div className="header-logo-wrap">
            <img src="/fin.png" alt="PSM" />
          </div>
          <div className="header-info">
            <div className="greeting">Hello,</div>
            <div className="header-name">{employee?.name || 'Employee'}</div>
            <div className="header-dept">
              {employee?.department || ''}
              {employee?.designation ? ` - ${employee.designation}` : ''}
            </div>
          </div>
        </div>
        <button className="profile-btn" onClick={() => setShowMenu(true)} aria-label="Profile">
          {avatarSource ? (
            <img src={avatarSource} alt="Profile" />
          ) : (
            <div className="avatar-fallback">{initials}</div>
          )}
        </button>
      </header>

      <div className="home-body">
        <div className="card">
          <div className="card-title">Today's Attendance</div>
          <div className="card-date">{today}</div>

          {attendance ? (
            <>
              <div className="status-row">
                <span className="status-label">Status</span>
                <span
                  className="status-badge"
                  style={{
                    backgroundColor: statusColor + '20',
                    color: statusColor,
                  }}
                >
                  {attendance.status}
                </span>
              </div>

              <div className="time-row">
                <div className="time-block">
                  <div className="time-label">Clock In</div>
                  <div className="time-value">{attendance.clock_in || '--:--'}</div>
                </div>
                <div className="time-divider" />
                <div className="time-block">
                  <div className="time-label">Clock Out</div>
                  <div className="time-value">{attendance.clock_out || '--:--'}</div>
                </div>
                <div className="time-divider" />
                <div className="time-block">
                  <div className="time-label">Hours</div>
                  <div className="time-value">
                    {attendance.working_hours ? `${attendance.working_hours}h` : '--'}
                  </div>
                </div>
              </div>

              {attendance.latitude != null && attendance.longitude != null && (
                <div className="gps-section">
                  <div className="gps-label">GPS Location</div>
                  {placeDetails ? (
                    <>
                      <div className="place-row">
                        <FiMapPin size={14} color="#10b981" />
                        <span className="place-text">{placeDetails.formattedAddress}</span>
                      </div>
                      <div className="gps-text">
                        {attendance.latitude.toFixed(6)}, {attendance.longitude.toFixed(6)}
                      </div>
                    </>
                  ) : (
                    <div className="gps-text">
                      GPS: {attendance.latitude.toFixed(6)}, {attendance.longitude.toFixed(6)}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="no-attendance">
              <div className="no-attendance-text">No attendance marked yet</div>
              <div className="no-attendance-sub">Tap the button below to clock in</div>
            </div>
          )}
        </div>

        <div className="actions">
          {!attendance?.clock_in ? (
            <button className="action-btn clock-in-btn" onClick={handleClockIn}>
              <FiCamera size={36} />
              <span className="action-btn-text">Clock In</span>
              <span className="action-btn-sub">Check in from anywhere</span>
            </button>
          ) : !attendance?.clock_out ? (
            <button
              className="action-btn clock-out-btn"
              onClick={handleClockOut}
              disabled={clockingOut}
            >
              <FiClock size={36} />
              <span className="action-btn-text">Clock Out</span>
              <span className="action-btn-sub">End your work day</span>
            </button>
          ) : (
            <div className="done-card">
              <FiCheckCircle size={36} color="#10b981" />
              <div className="done-text">Attendance Complete</div>
              <div className="done-sub">You have clocked in and out today</div>
            </div>
          )}
        </div>

        <Link to="/history" className="history-btn">
          <FiRotateCcw size={18} />
          View Attendance History
        </Link>
      </div>

      {showMenu && (
        <div className="menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="menu-card" onClick={(e) => e.stopPropagation()}>
            <div className="menu-header">
              {avatarSource ? (
                <img className="menu-avatar" src={avatarSource} alt="Profile" />
              ) : (
                <div className="menu-avatar menu-avatar-fallback">{initials}</div>
              )}
              <div className="menu-info">
                <div className="menu-name">{employee?.name || 'User'}</div>
                <div className="menu-role">
                  {employee?.designation || employee?.department || ''}
                </div>
                <span className="menu-badge">
                  {personType === 'intern' ? 'Intern' : 'Employee'}
                </span>
              </div>
            </div>
            <div className="menu-divider" />
            <button className="menu-item" onClick={handleLogout}>
              <FiLogOut size={20} />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
