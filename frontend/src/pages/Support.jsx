import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getSupportRequests,
  getSupportTicket,
  updateSupportStatus,
  updateSupportPriority,
  addSupportResponse,
} from '../services/services';
import {
  HiOutlineDownload,
  HiOutlineRefresh,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineClock,
  HiOutlineChat,
  HiOutlineInformationCircle,
} from 'react-icons/hi';

const STATUS_ORDER = ['open', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled', 'rejected'];

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting: 'Waiting for You',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

const STATUS_BADGES = {
  open: 'badge-open',
  in_progress: 'badge-in-progress',
  waiting: 'badge-waiting',
  resolved: 'badge-resolved',
  closed: 'badge-closed',
  cancelled: 'badge-cancelled',
  rejected: 'badge-rejected',
};

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

export default function Support() {
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [message, setMessage] = useState(null);
  const [categories, setCategories] = useState([]);

  const flash = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSupportRequests({ limit: 100, skip: 0 });
      setRequests(res.data.requests || []);
      setStats(res.data.stats || {});
      if (Array.isArray(res.data.categories)) {
        setCategories(res.data.categories);
      }
    } catch (err) {
      console.error('Failed to load support requests:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (!q) return true;
      const num = (r.ticket_number || '').toLowerCase();
      const name = (r.person_label || '').toLowerCase();
      const subj = (r.subject || '').toLowerCase();
      const cat = (r.category || '').toLowerCase();
      return num.includes(q) || name.includes(q) || subj.includes(q) || cat.includes(q);
    });
  }, [requests, statusFilter, categoryFilter, search]);

  const openTicket = async (ticketId) => {
    setSelectedTicket(null);
    setTicketLoading(true);
    try {
      const res = await getSupportTicket(ticketId);
      setSelectedTicket(res.data.ticket || res.data || null);
    } catch (err) {
      console.error('Failed to load ticket:', err);
      flash('error', 'Failed to load ticket details.');
    } finally {
      setTicketLoading(false);
    }
  };

  const handleStatusChange = async (ticketId, newStatus) => {
    setActionId(ticketId);
    setActionType('status');
    try {
      await updateSupportStatus(ticketId, newStatus);
      flash('success', `Ticket status updated to ${STATUS_LABELS[newStatus] || newStatus}.`);
      await load();
      if (selectedTicket && selectedTicket._id === ticketId) {
        await openTicket(ticketId);
      }
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to update status.');
    } finally {
      setActionId(null);
      setActionType(null);
    }
  };

  const handlePriorityChange = async (ticketId, newPriority) => {
    setActionId(ticketId);
    setActionType('priority');
    try {
      await updateSupportPriority(ticketId, newPriority);
      flash('success', `Priority updated to ${PRIORITY_LABELS[newPriority] || newPriority}.`);
      await load();
      if (selectedTicket && selectedTicket._id === ticketId) {
        await openTicket(ticketId);
      }
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to update priority.');
    } finally {
      setActionId(null);
      setActionType(null);
    }
  };

  const handleSendResponse = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    if (!replyBody.trim()) return;
    setReplying(true);
    try {
      const formData = new FormData();
      formData.append('body', replyBody.trim());
      await addSupportResponse(selectedTicket._id, formData);
      setReplyBody('');
      flash('success', 'Response added to the ticket.');
      await openTicket(selectedTicket._id);
    } catch (err) {
      flash('error', err.response?.data?.error || 'Failed to send response.');
    } finally {
      setReplying(false);
    }
  };

  const closeDetail = () => setSelectedTicket(null);

  const categoryList = useMemo(() => {
    const unique = [...new Set(requests.map((r) => r.category).filter(Boolean))];
    return unique.sort();
  }, [requests]);

  return (
    <div className="support-page">
      <div className="page-header">
        <h1>Support Requests</h1>
        <p>Complaints and help-desk tickets raised from the mobile app.</p>
      </div>

      {message && (
        <div className={`flash flash-${message.type}`}>{message.text}</div>
      )}

      <div className="toolbar">
        <div className="filter-group">
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select"
          >
            <option value="all">All Statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] || s}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="select"
          >
            <option value="all">All Categories</option>
            {categoryList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="filter-group search">
          <label>Search</label>
          <input
            type="text"
            placeholder="Ticket number, subject, person..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="stats-row">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="stat-card">
            <div className="stat-label">{STATUS_LABELS[s] || s}</div>
            <div className="stat-value">{stats[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticket #</th>
              <th>Raised By</th>
              <th>Subject</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Updated</th>
              <th className="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  No support requests found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const isBusy = actionId === r._id && actionType === 'status';
                const isPriBusy = actionId === r._id && actionType === 'priority';
                const currentStatus = r.status || 'open';
                const nextStatus =
                  currentStatus === 'open' ? 'in_progress' :
                  currentStatus === 'in_progress' ? 'waiting' :
                  currentStatus === 'waiting' ? 'resolved' :
                  'open';
                return (
                  <tr key={r._id}>
                    <td>
                      <div className="ticket-number">{r.ticket_number || '-'}</div>
                    </td>
                    <td>{r.person_label || '-'}</td>
                    <td>{r.subject || '-'}</td>
                    <td>{r.category || '-'}</td>
                    <td>
                      <span className={`priority priority-${r.priority || 'medium'}`}>
                        {PRIORITY_LABELS[r.priority || 'medium']}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGES[currentStatus] || ''}`}>
                        {STATUS_LABELS[currentStatus] || currentStatus}
                      </span>
                    </td>
                    <td>
                      <div className="muted small">{r.updated_at || r.created_at || '-'}</div>
                    </td>
                    <td className="actions">
                      <div className="action-buttons">
                        <button
                          className="btn btn-sm btn-outline"
                          disabled={isBusy}
                          onClick={() => openTicket(r._id)}
                        >
                          {isBusy ? '...' : 'View'}
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={isBusy}
                          onClick={() => handleStatusChange(r._id, nextStatus)}
                        >
                          {isBusy ? '...' : `Set ${STATUS_LABELS[nextStatus] || nextStatus}`}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedTicket && (
        <div className="detail-panel">
          <div className="detail-header">
            <h2>
              {selectedTicket.ticket_number}
              {selectedTicket.priority === 'high' && (
                <span className="priority-pill">High Priority</span>
              )}
            </h2>
            <button className="btn btn-sm btn-outline" onClick={closeDetail}>
              <HiOutlineX size={16} /> Close
            </button>
          </div>

          <div className="detail-grid">
            <div className="detail-field">
              <label>Subject</label>
              <div className="detail-value">{selectedTicket.subject || '-'}</div>
            </div>
            <div className="detail-field">
              <label>Category</label>
              <div className="detail-value">{selectedTicket.category || '-'}</div>
            </div>
            <div className="detail-field">
              <label>Priority</label>
              <div className="detail-value">
                <span className={`priority priority-${selectedTicket.priority || 'medium'}`}>
                  {PRIORITY_LABELS[selectedTicket.priority || 'medium']}
                </span>
              </div>
            </div>
            <div className="detail-field">
              <label>Status</label>
              <div className="detail-value">
                <span
                  className={`badge ${STATUS_BADGES[selectedTicket.status || 'open'] || ''}`}
                >
                  {STATUS_LABELS[selectedTicket.status || 'open'] || selectedTicket.status}
                </span>
              </div>
            </div>
            <div className="detail-field">
              <label>Raised By</label>
              <div className="detail-value">
                {selectedTicket.person_label || '-'}
                {selectedTicket.id_label ? ` (${selectedTicket.id_label})` : ''}
              </div>
            </div>
            <div className="detail-field">
              <label>Created</label>
              <div className="detail-value muted small">
                {selectedTicket.created_at || '-'}
              </div>
            </div>
            <div className="detail-field">
              <label>Last Updated</label>
              <div className="detail-value muted small">
                {selectedTicket.updated_at || '-'}
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>Description</h3>
            <div className="detail-value description">
              {selectedTicket.description || '-'}
            </div>
          </div>

          <div className="detail-section">
            <h3>Change Status</h3>
            <div className="status-actions">
              {STATUS_ORDER.map((s) => {
                const disabled =
                  selectedTicket.status === s || actionId === selectedTicket._id;
                return (
                  <button
                    key={s}
                    className={`btn btn-sm ${selectedTicket.status === s ? 'btn-active' : 'btn-outline'}`}
                    disabled={disabled}
                    onClick={() => handleStatusChange(selectedTicket._id, s)}
                  >
                    {STATUS_LABELS[s] || s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="detail-section">
            <h3>Change Priority</h3>
            <div className="priority-actions">
              {['low', 'medium', 'high'].map((p) => (
                <button
                  key={p}
                  className={`btn btn-sm ${selectedTicket.priority === p ? 'btn-active' : 'btn-outline'}`}
                  disabled={actionId === selectedTicket._id}
                  onClick={() => handlePriorityChange(selectedTicket._id, p)}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <h3>Add Response</h3>
            <form onSubmit={handleSendResponse} className="reply-form">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Type your response..."
                rows={4}
                className="textarea"
                disabled={replying}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={replying || !replyBody.trim()}
              >
                {replying ? 'Sending...' : 'Send Response'}
              </button>
            </form>
          </div>

          {selectedTicket.comments && selectedTicket.comments.length > 0 && (
            <div className="detail-section">
              <h3>Conversation</h3>
              <div className="conversation">
                {selectedTicket.comments.map((c, i) => (
                  <div key={i} className={`comment ${c.author_type === 'support' ? 'comment-support' : 'comment-employee'}`}>
                    <div className="comment-header">
                      <strong>{c.author || (c.author_type === 'support' ? 'Support Team' : selectedTicket.person_label)}</strong>
                      <span className="muted small">{c.created_at || ''}</span>
                    </div>
                    <div className="comment-body">{c.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
