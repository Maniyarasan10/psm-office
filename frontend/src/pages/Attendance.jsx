import { useState, useEffect } from 'react';
import {
  getAttendance, markAttendance, clockIn as clockInApi, clockOut as clockOutApi, setAttendanceStatus,
  attendancePhotoUrl, profilePhotoUrl, getPersonAttendanceSummary, getAttendanceReport,
} from '../services/services';
import { HiOutlineDownload } from 'react-icons/hi';

export default function Attendance() {
  const [roster, setRoster] = useState([]);
  const [summary, setSummary] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [photoModal, setPhotoModal] = useState(null);
  const [summaryModal, setSummaryModal] = useState(null);
  const [personSummary, setPersonSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportStatus, setExportStatus] = useState('All');
  const [exportData, setExportData] = useState([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

  const displayName = (person) => {
    const name = String(person.name || '').trim();
    const employeeId = String(person.employee_id || '').trim();
    if (name && !OBJECT_ID_RE.test(name)) return name;
    if (employeeId && !OBJECT_ID_RE.test(employeeId)) return employeeId;
    return 'Unknown';
  };

  useEffect(() => {
    loadAttendance();
  }, [selectedDate]);

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const res = await getAttendance(selectedDate);
      setRoster(res.data.roster || []);
      setSummary(res.data.summary || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async (person) => {
    const time = new Date().toTimeString().slice(0, 5);
    try {
      await clockInApi({
        person_type: person.person_type,
        person_id: person.person_id,
        date: selectedDate,
        time,
      });
      loadAttendance();
    } catch (err) {
      console.error(err);
    }
  };

  const handleClockOut = async (person) => {
    const time = new Date().toTimeString().slice(0, 5);
    try {
      await clockOutApi({
        person_type: person.person_type,
        person_id: person.person_id,
        date: selectedDate,
        time,
      });
      loadAttendance();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (person, newStatus) => {
    try {
      await setAttendanceStatus({
        person_type: person.person_type,
        person_id: person.person_id,
        date: selectedDate,
        status: newStatus,
      });
      loadAttendance();
    } catch (err) {
      console.error(err);
    }
  };

  const handleNameClick = async (person) => {
    setSummaryModal(person);
    setSummaryLoading(true);
    setPersonSummary(null);
    try {
      const res = await getPersonAttendanceSummary(person.person_id);
      setPersonSummary(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Type', 'Clock In', 'Clock Out', 'Hours', 'Status', 'Lat', 'Lng'];
      const rows = roster.map(r => [
        displayName(r), r.person_type, r.clock_in || '', r.clock_out || '',
      r.working_hours || '', r.status, r.latitude || '', r.longitude || '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadExportData = async () => {
    if (!exportStartDate || !exportEndDate) {
      alert('Please select start and end dates');
      return;
    }
    setExportLoading(true);
    try {
      const res = await getAttendanceReport(exportStartDate, exportEndDate);
      let data = res.data || [];
      if (exportStatus !== 'All') {
        data = data.filter(r => r.status === exportStatus);
      }
      setExportData(data);
      setShowExportModal(true);
    } catch (err) {
      console.error(err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportFilteredCSV = () => {
    const headers = ['Name', 'Type', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Status', 'Lat', 'Lng'];
      const rows = exportData.map(r => [
        displayName(r) || '', r.person_type || '', r.date || '', r.clock_in || '', r.clock_out || '',
      r.working_hours || '', r.status || '', r.latitude || '', r.longitude || '',
    ]);

    const totalDays = exportData.length;
    const present = exportData.filter(r => r.status === 'Present').length;
    const absent = exportData.filter(r => r.status === 'Absent').length;
    const late = exportData.filter(r => r.status === 'Late').length;
    const remote = exportData.filter(r => r.status === 'Remote').length;
    const office = exportData.filter(r => r.status === 'Office').length;
    const totalHours = exportData.reduce((sum, r) => sum + (r.working_hours || 0), 0);

    const summaryRows = [
      [],
      ['--- Summary ---'],
      ['Total Records', totalDays],
      ['Present', present],
      ['Absent', absent],
      ['Late', late],
      ['Remote', remote],
      ['Office', office],
      ['Total Hours', totalHours.toFixed(2)],
      ['Avg Hours/Day', totalDays > 0 ? (totalHours / totalDays).toFixed(2) : '0'],
    ];

    const csv = [headers, ...rows, ...summaryRows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${exportStartDate}_to_${exportEndDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Attendance</h2>
          <p>
            {summary.present || 0} present, {summary.absent || 0} absent, {summary.remote || 0} remote
          </p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={exportCSV}>
            <HiOutlineDownload size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <label style={{ fontWeight: 600, fontSize: 13 }}>Date:</label>
        <input
          type="date"
          className="date-input"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        <div className="filter-range">
          <label style={{ fontWeight: 600, fontSize: 13 }}>From:</label>
          <input
            type="date"
            className="date-input"
            value={exportStartDate}
            onChange={(e) => setExportStartDate(e.target.value)}
          />
          <label style={{ fontWeight: 600, fontSize: 13 }}>To:</label>
          <input
            type="date"
            className="date-input"
            value={exportEndDate}
            onChange={(e) => setExportEndDate(e.target.value)}
          />
          <select
            value={exportStatus}
            onChange={(e) => setExportStatus(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <option value="All">All Status</option>
            <option value="Present">Present</option>
            <option value="Absent">Absent</option>
            <option value="Late">Late</option>
            <option value="Remote">Remote</option>
            <option value="Office">Office</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={loadExportData}
            disabled={exportLoading}
            style={{ fontSize: 13 }}
          >
            <HiOutlineDownload size={14} /> {exportLoading ? 'Loading...' : 'Export Range'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Name</th>
                <th>Type</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-state">Loading...</td></tr>
              ) : roster.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No employees or interns found.</td></tr>
              ) : (
                roster.map((person, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="avatar-sm">
                        <img src={profilePhotoUrl(person.profile_photo_path)} alt="" className="avatar-img" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.className = 'avatar-sm avatar-fallback';                         e.target.parentElement.textContent = displayName(person)?.charAt(0)?.toUpperCase() || '?'; }} />
                      </div>
                    </td>
                    <td>
                      <strong
                        onClick={() => handleNameClick(person)}
                        style={{ cursor: 'pointer', color: 'var(--accent)' }}
                        title="Click to view attendance summary"
                      >
                        {displayName(person)}
                      </strong>
                    </td>
                    <td>
                      <span className={`badge badge-${person.person_type === 'employee' ? 'active' : 'progress'}`}>
                        {person.person_type}
                      </span>
                    </td>
                    <td>{person.clock_in || '-'}</td>
                    <td>{person.clock_out || '-'}</td>
                    <td>{person.working_hours ? `${person.working_hours}h` : '-'}</td>
                    <td>
                      <select
                        value={person.status}
                        onChange={(e) => handleStatusChange(person, e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                        }}
                      >
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Late">Late</option>
                        <option value="Remote">Remote</option>
                        <option value="Office">Office</option>
                      </select>
                    </td>
                    <td>
                      <div className="table-actions">
                        {!person.clock_in ? (
                          <button className="btn btn-success btn-sm" onClick={() => handleClockIn(person)}>
                            Clock In
                          </button>
                        ) : !person.clock_out ? (
                          <button className="btn btn-warning btn-sm" onClick={() => handleClockOut(person)}>
                            Clock Out
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Done</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {photoModal && (
        <div className="modal-overlay" onClick={() => setPhotoModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>Geotag Photo - {photoModal.name}</h3>
              <button className="modal-close" onClick={() => setPhotoModal(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <img
                src={attendancePhotoUrl(photoModal.photo_path)}
                alt="Geotag"
                style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 16 }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12 }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Clock In</div>
                  <div style={{ fontSize: 14 }}>{photoModal.clock_in || '-'}</div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Status</div>
                  <div style={{ fontSize: 14 }}>{photoModal.status}</div>
                </div>
              </div>
              {photoModal.latitude && photoModal.longitude && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>GPS Coordinates</div>
                  <div>Lat: {photoModal.latitude?.toFixed(6)}, Lng: {photoModal.longitude?.toFixed(6)}</div>
                  <a
                    href={`https://www.google.com/maps?q=${photoModal.latitude},${photoModal.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', fontSize: 12, marginTop: 4, display: 'inline-block' }}
                  >
                    Open in Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {summaryModal && (
        <div className="modal-overlay" onClick={() => setSummaryModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Attendance Summary - {displayName(summaryModal)}</h3>
              <button className="modal-close" onClick={() => setSummaryModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {summaryLoading ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>Loading...</div>
              ) : personSummary ? (
                <div>
                  <div className="att-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                    <div style={{ textAlign: 'center', padding: '16px 8px', background: 'var(--bg-input)', borderRadius: 8 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{personSummary.total}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 4 }}>Total Days</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '16px 8px', background: '#ecfdf5', borderRadius: 8 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{personSummary.present}</div>
                      <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 4 }}>Present</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '16px 8px', background: '#fef2f2', borderRadius: 8 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{personSummary.absent}</div>
                      <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 4 }}>Absent</div>
                    </div>
                  </div>

                  <div className="att-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                    <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fffbeb', borderRadius: 8 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{personSummary.late}</div>
                      <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600, marginTop: 2 }}>Late</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '12px 8px', background: '#eff6ff', borderRadius: 8 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{personSummary.remote}</div>
                      <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginTop: 2 }}>Remote</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0f9ff', borderRadius: 8 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#0284c7' }}>{personSummary.office}</div>
                      <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 600, marginTop: 2 }}>Office</div>
                    </div>
                  </div>

                  <div className="att-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-input)', borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{personSummary.total_hours}h</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Total Hours</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-input)', borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{personSummary.avg_hours}h</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Avg Hours/Day</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-input)', borderRadius: 8 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: personSummary.attendance_rate >= 80 ? '#10b981' : personSummary.attendance_rate >= 60 ? '#f59e0b' : '#ef4444' }}>
                        {personSummary.attendance_rate}%
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Attendance Rate</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>No data available</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>Attendance Report ({exportStartDate} to {exportEndDate})</h3>
              <button className="modal-close" onClick={() => setShowExportModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="att-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--bg-input)', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{exportData.length}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>Total</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#ecfdf5', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{exportData.filter(r => r.status === 'Present').length}</div>
                  <div style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>Present</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#fef2f2', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{exportData.filter(r => r.status === 'Absent').length}</div>
                  <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>Absent</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#fffbeb', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{exportData.filter(r => r.status === 'Late').length}</div>
                  <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>Late</div>
                </div>
              </div>

              <div className="att-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#eff6ff', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>{exportData.filter(r => r.status === 'Remote').length}</div>
                  <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>Remote</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#f0f9ff', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#0284c7' }}>{exportData.filter(r => r.status === 'Office').length}</div>
                  <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 600 }}>Office</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--bg-input)', borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {exportData.reduce((s, r) => s + (r.working_hours || 0), 0).toFixed(1)}h
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>Total Hours</div>
                </div>
              </div>

              {exportData.length > 0 ? (
                <div style={{ maxHeight: 300, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                  <table style={{ width: '100%', minWidth: 520, fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Date</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>In</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Out</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Hours</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportData.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '6px 10px' }}>{displayName(r)}</td>
                          <td style={{ padding: '6px 10px' }}>{r.date}</td>
                          <td style={{ padding: '6px 10px' }}>{r.clock_in || '-'}</td>
                          <td style={{ padding: '6px 10px' }}>{r.clock_out || '-'}</td>
                          <td style={{ padding: '6px 10px' }}>{r.working_hours ? `${r.working_hours}h` : '-'}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span className={`badge badge-${r.status === 'Present' ? 'active' : r.status === 'Absent' ? 'danger' : r.status === 'Late' ? 'warning' : 'progress'}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>No records found</div>
              )}

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={exportFilteredCSV}>
                  <HiOutlineDownload size={14} /> Download CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
