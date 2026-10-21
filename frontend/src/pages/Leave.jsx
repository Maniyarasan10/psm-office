import { useState, useEffect, useMemo } from 'react';
import {
  getLeaveRequests,
  approveLeave,
  rejectLeave,
} from '../services/services';
import { HiOutlineDownload, HiOutlineRefresh, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_BADGES = {
  pending: 'badge-pending',
  approved: 'badge-completed',
  rejected: 'badge-inactive',
};

export default function Leave() {
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLeaveRequests();
      setRequests(res.data.requests || []);
      setStats(res.data.stats || { pending: 0, approved: 0, rejected: 0, total: 0 });
    } catch (err) {
      console.error('Failed to load leave requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const flash = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleApprove = async (request) => {
    if (!window.confirm(`Approve ${request.leave_type} leave for ${request.person_name || 'this person'}?`)) {
      return;
    }
    setActionId(request._id);
    try {
      await approveLeave(request._id);
      flash('success', 'Leave approved and attendance updated.');
      await load();
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to approve leave.');
    } finally {
      setActionId(null);
    }
  };

  const openReject = (request) => {
    setRejectTarget(request);
    setRejectNote('');
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setActionId(rejectTarget._id);
    try {
      await rejectLeave(rejectTarget._id, rejectNote.trim());
      flash('success', 'Leave request rejected.');
      setRejectTarget(null);
      await load();
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to reject leave.');
    } finally {
      setActionId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const name = (r.person_name || '').toLowerCase();
      const label = (r.id_label || '').toLowerCase();
      const type = (r.leave_type || '').toLowerCase();
      return name.includes(q) || label.includes(q) || type.includes(q);
    });
  }, [requests, statusFilter, search]);

  const exportCSV = () => {
    const headers = ['Name', 'ID', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Reviewed By', 'Note'];
    const rows = filtered.map((r) => [
      r.person_name || '',
      r.id_label || '',
      r.leave_type || '',
      r.start_date || '',
      r.end_date || '',
      r.days ?? '',
      (r.reason || '').replace(/[\r\n]+/g, ' '),
      STATUS_LABELS[r.status] || r.status,
      r.reviewed_by || '',
      (r.review_note || '').replace(/[\r\n]+/g, ' '),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leave_requests_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'pending', label: 'Pending', count: stats.pending },
    { key: 'approved', label: 'Approved', count: stats.approved },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Leave</h2>
          <p>Review leave requests submitted from the mobile app.</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <HiOutlineRefresh size={16} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={exportCSV} disabled={filtered.length === 0}>
            <HiOutlineDownload size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card warning">
          <div className="stat-number">{stats.pending}</div>
          <div className="stat-label">Pending Requests</div>
        </div>
        <div className="stat-card success">
          <div className="stat-number">{stats.approved}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-number">{stats.rejected}</div>
          <div className="stat-label">Rejected</div>
        </div>
        <div className="stat-card info">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Requests</div>
        </div>
      </div>

      <div className="filter-bar">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`btn ${statusFilter === t.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setStatusFilter(t.key)}
              style={{ fontSize: 13 }}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
        <input
          type="text"
          className="filter-search"
          placeholder="Search by name, ID or leave type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {message && (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: message.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
            color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {message.text}
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-state">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No leave requests found.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <strong>{r.person_name || 'Unknown'}</strong>
                      {r.id_label ? (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.id_label}</div>
                      ) : null}
                    </td>
                    <td>{r.leave_type}</td>
                    <td>{r.start_date}</td>
                    <td>{r.end_date}</td>
                    <td>{r.days}</td>
                    <td
                      title={r.reason || ''}
                      style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {r.reason || '-'}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGES[r.status] || 'badge-progress'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td>
                      {r.status === 'pending' ? (
                        <div className="table-actions">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleApprove(r)}
                            disabled={actionId === r._id}
                          >
                            <HiOutlineCheck size={14} /> Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => openReject(r)}
                            disabled={actionId === r._id}
                          >
                            <HiOutlineX size={14} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {r.review_note ? `Note: ${r.review_note}` : 'Reviewed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rejectTarget && (
        <div className="modal-overlay" onClick={() => setRejectTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Reject leave request</h3>
              <button className="modal-close" onClick={() => setRejectTarget(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
                Reject <strong>{rejectTarget.leave_type}</strong> leave for{' '}
                <strong>{rejectTarget.person_name || 'this person'}</strong> ({rejectTarget.start_date} to{' '}
                {rejectTarget.end_date})?
              </p>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Reason (optional)
              </label>
              <textarea
                className="note-area"
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Let the person know why this was rejected..."
                style={{ marginTop: 6 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmReject} disabled={actionId === rejectTarget._id}>
                  <HiOutlineX size={14} /> {actionId === rejectTarget._id ? 'Rejecting...' : 'Reject request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
