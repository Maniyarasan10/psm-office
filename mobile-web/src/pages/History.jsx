import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowLeft,
  FiRefreshCw,
  FiLogIn,
  FiLogOut,
  FiClock,
  FiMapPin,
  FiCalendar,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { getPersonAttendance, reverseGeocode } from '../services/api';

const STATUS_COLORS = {
  Present: '#10b981',
  Absent: '#ef4444',
  Late: '#f59e0b',
  Remote: '#3b82f6',
  Office: '#2563eb',
};

const STATUS_BG = {
  Present: '#ecfdf5',
  Absent: '#fef2f2',
  Late: '#fffbeb',
  Remote: '#eff6ff',
  Office: '#eff6ff',
};

function getStatusColor(status) {
  return STATUS_COLORS[status] || '#94a3b8';
}

function getStatusBg(status) {
  return STATUS_BG[status] || '#f8fafc';
}

function getMonthYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDate();
}

function formatWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function History() {
  const navigate = useNavigate();
  const { employee } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [places, setPlaces] = useState({});
  const fetchedPlaces = useRef({});

  const loadHistory = useCallback(async () => {
    try {
      const res = await getPersonAttendance(employee._id, 30);
      const data = res.data || [];
      setRecords(data);

      data.forEach(async (record) => {
        if (
          record.latitude != null &&
          record.longitude != null &&
          !fetchedPlaces.current[record._id]
        ) {
          fetchedPlaces.current[record._id] = true;
          const place = await reverseGeocode(record.latitude, record.longitude);
          if (place) {
            setPlaces((prev) => ({ ...prev, [record._id]: place }));
          }
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const sections = useMemo(() => {
    const map = {};
    for (const r of records) {
      const key = getMonthYear(r.date);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return Object.entries(map).map(([title, data]) => ({ title, data }));
  }, [records]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={() => navigate(-1)} aria-label="Back">
          <FiArrowLeft size={22} />
        </button>
        <div className="header-col">
          <div className="header-title">Attendance History</div>
          <div className="header-sub">Last 30 records</div>
        </div>
        <button className="refresh-btn" onClick={onRefresh} aria-label="Refresh">
          <FiRefreshCw className={refreshing ? 'spin' : ''} size={18} />
        </button>
      </header>

      {records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <FiCalendar size={40} />
          </div>
          <div className="empty-title">No Records</div>
          <p className="empty-text">
            Your attendance history will appear here after you start marking attendance.
          </p>
        </div>
      ) : (
        <div className="page-body">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="section-header">
                <span className="section-title">{section.title}</span>
                <div className="section-line" />
              </div>

              {section.data.map((item) => {
                const color = getStatusColor(item.status);
                return (
                  <div className="record-card" key={item._id || item.date}>
                    <div className="record-top">
                      <div className="record-date-col">
                        <div className="record-day">{item.date ? formatDay(item.date) : '--'}</div>
                        <div className="record-weekday">
                          {item.date ? formatWeekday(item.date) : ''}
                        </div>
                      </div>
                      <div className="record-main">
                        <span
                          className="record-badge"
                          style={{ backgroundColor: getStatusBg(item.status) }}
                        >
                          <span className="record-dot" style={{ backgroundColor: color }} />
                          <span className="record-status" style={{ color }}>
                            {item.status}
                          </span>
                        </span>
                        <div className="record-times">
                          <div className="time-chip">
                            <FiLogIn size={12} />
                            <span className="time-chip-label">IN</span>
                            <span className="time-chip-value">{item.clock_in || '--:--'}</span>
                          </div>
                          <div className="time-chip">
                            <FiLogOut size={12} />
                            <span className="time-chip-label">OUT</span>
                            <span className="time-chip-value">{item.clock_out || '--:--'}</span>
                          </div>
                          <div className="time-chip">
                            <FiClock size={12} />
                            <span className="time-chip-label">HRS</span>
                            <span className="time-chip-value">
                              {item.working_hours ? item.working_hours : '--'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {item.photo_path && item.latitude != null && item.longitude != null && (
                      <div className="record-location">
                        <FiMapPin size={13} color="#10b981" />
                        {places[item._id] ? (
                          <span>{places[item._id].formattedAddress}</span>
                        ) : (
                          <span>
                            {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
