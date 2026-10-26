import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getDailyReports,
  deleteDailyReport,
  getEmployees,
  getInterns,
} from '../services/services';
import { HiOutlineTrash, HiOutlineUser } from 'react-icons/hi';

const colors = { textMuted: '#6b7280', textPrimary: '#111827' };

const PERSON_TYPES = ['all', 'employee', 'intern'];

export default function DailyReports() {
  const [reports, setReports] = useState([]);
  const [people, setPeople] = useState({}); // _id -> { name, type }
  const [filterDate, setFilterDate] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate) params.date = filterDate;
      if (filterType && filterType !== 'all') params.person_type = filterType;
      const res = await getDailyReports(params);
      const list = res.data?.reports || [];

      const [empRes, intRes] = await Promise.all([
        getEmployees().catch(() => ({ data: [] })),
        getInterns().catch(() => ({ data: [] })),
      ]);
      const map = {};
      (empRes.data || []).forEach((p) => {
        map[p._id] = { name: p.name, type: 'employee', label: p.employee_id };
      });
      (intRes.data || []).forEach((p) => {
        map[p._id] = { name: p.name, type: 'intern', label: p.intern_id };
      });
      setPeople(map);
      setReports(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this work report?')) return;
    setDeletingId(id);
    try {
      await deleteDailyReport(id);
      setReports(reports.filter((r) => r._id !== id));
    } catch (err) {
      console.error(err);
      window.alert('Could not delete the report.');
    } finally {
      setDeletingId(null);
    }
  };

  const personLabel = useMemo(() => {
    const map = {};
    Object.entries(people).forEach(([id, info]) => {
      map[id] = `${info.name || info.label || 'Unknown'} (${info.label || ''})`;
    });
    return map;
  }, [people]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-header-left">
            <h2>Daily Work Reports</h2>
            <p>Work progress submitted by employees and interns.</p>
          </div>
        </div>
        <div className="card" style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Loading reports…
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Daily Work Reports</h2>
          <p>Work progress submitted by employees and interns.</p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="date"
          className="date-input"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          placeholder="Filter by date"
        />
        <select
          value={filterType}
          className="date-input"
          onChange={(e) => setFilterType(e.target.value)}
        >
          {PERSON_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All people' : `${t.charAt(0).toUpperCase() + t.slice(1)}s`}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Person</th>
                <th>Type</th>
                <th>Work progress</th>
                <th>Hours</th>
                <th>Submitted</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    No daily work reports found for the selected filters.
                  </td>
                </tr>
              ) : (
                reports.map((r) => {
                  const info = people[r.person_id] || {};
                  const label = personLabel[r.person_id] || r.person_id;
                  return (
                    <tr key={r._id}>
                      <td>{r.date}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <HiOutlineUser size={14} color={colors ? colors.textMuted : '#666'} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{info.name || info.label || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: '#666' }}>{info.label || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${r.person_type === 'intern' ? 'pending' : 'active'}`}>
                          {r.person_type}
                        </span>
                      </td>
                      <td>{r.content || '-'}</td>
                      <td>{r.hours != null ? `${r.hours} h` : '-'}</td>
                      <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className='btn btn-danger'
                          onClick={() => handleDelete(r._id)}
                          disabled={deletingId === r._id}
                          style={{ padding: '4px 8px', fontSize: 12 }}
                        >
                          {deletingId === r._id ? 'Deleting…' : <HiOutlineTrash size={14} />}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
