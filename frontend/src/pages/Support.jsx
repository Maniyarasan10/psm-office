import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getSupportRequests,
  getSupportTicket,
  updateSupportStatus,
  updateSupportPriority,
  addSupportResponse,
  supportAttachmentFileUrl,
  supportAttachmentUrl,
} from '../services/services';
import {
  HiOutlineDownload,
  HiOutlineRefresh,
  HiOutlineCheck,
  HiOutlineX,
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
  in_progress: 'badge-progress',
  waiting: 'badge-waiting',
  resolved: 'badge-resolved',
  closed: 'badge-closed',
  cancelled: 'badge-cancelled',
  rejected: 'badge-rejected',
};

const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

function isImageAttachment(attachment) {
  const mime = attachment.mime || '';
  if (mime.startsWith('image/')) return true;
  return IMAGE_EXTENSION_RE.test(attachment.file_name || '');
}

/**
 * One employee/support attachment. Images render inline from the signed URL the
 * API returned; the download link goes through the authenticated endpoint.
 */
function AttachmentRow({ attachment }) {
  const src = supportAttachmentFileUrl(attachment.file_url);
  const image = isImageAttachment(attachment);

  return (
    <div style={{ marginTop: 8 }}>
      {image && src ? (
        <a href={src} target="_blank" rel="noreferrer" title="Open full image">
          <img
            src={src}
            alt={attachment.file_name || 'Attachment'}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 260,
              borderRadius: 8,
              border: '1px solid var(--border-light)',
              background: 'var(--bg-input)',
              objectFit: 'contain',
            }}
          />
        </a>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: image ? 6 : 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          {attachment.file_name || 'Attachment'}
        </span>
        <a
          className="btn btn-sm btn-outline"
          href={supportAttachmentUrl(attachment.attachment_id)}
          target="_blank"
          rel="noreferrer"
          download
          style={{ textDecoration: 'none', flexShrink: 0 }}
        >
          <HiOutlineDownload size={14} /> {image ? 'Open' : 'Download'}
        </a>
      </div>
    </div>
  );
}

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
      formData.append('author_type', 'support');
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
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Support Tickets</h2>
          <p>Complaints and help-desk tickets raised from the mobile app.</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <HiOutlineRefresh size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="stat-grid">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="stat-card info">
            <div className="stat-number">{stats[s] ?? 0}</div>
            <div className="stat-label">{STATUS_LABELS[s] || s}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <option value="all">All Status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <option value="all">All Categories</option>
            {categoryList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search ticket number, subject, person..."
            className="filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
                <th>Ticket #</th>
                <th>Raised By</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-state">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No support requests found.</td></tr>
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
                        <span className={`badge badge-${r.priority === 'high' ? 'high' : r.priority === 'low' ? 'low' : 'medium'}`}>
                          {PRIORITY_LABELS[r.priority || 'medium']}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGES[currentStatus] || ''}`}>
                          {STATUS_LABELS[currentStatus] || currentStatus}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {r.updated_at || r.created_at || '-'}
                        </div>
                      </td>
                      <td>
                        <div className="table-actions">
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
      </div>

      {selectedTicket && (
        <div className="modal-overlay" onClick={() => closeDetail()}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>
                {selectedTicket.ticket_number}
                {selectedTicket.priority === 'high' && (
                  <span className="badge badge-high" style={{ marginLeft: 10, fontSize: 11 }}>High Priority</span>
                )}
              </h3>
              <button className="modal-close" onClick={closeDetail}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Subject</label>
                  <div style={{ fontWeight: 600 }}>{selectedTicket.subject || '-'}</div>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <div>{selectedTicket.category || '-'}</div>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <div>
                    <span className={`badge badge-${selectedTicket.priority === 'high' ? 'high' : selectedTicket.priority === 'low' ? 'low' : 'medium'}`}>
                      {PRIORITY_LABELS[selectedTicket.priority || 'medium']}
                    </span>
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <div>
                    <span className={`badge ${STATUS_BADGES[selectedTicket.status || 'open'] || ''}`}>
                      {STATUS_LABELS[selectedTicket.status || 'open'] || selectedTicket.status}
                    </span>
                  </div>
                </div>
                <div className="form-group">
                  <label>Raised By</label>
                  <div>
                    {selectedTicket.person_label || '-'}
                    {selectedTicket.id_label ? ` (${selectedTicket.id_label})` : ''}
                  </div>
                </div>
                <div className="form-group">
                  <label>Created</label>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{selectedTicket.created_at || '-'}</div>
                </div>
                <div className="form-group">
                  <label>Last Updated</label>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{selectedTicket.updated_at || '-'}</div>
                </div>
              </div>

              <div className="section-card" style={{ marginTop: 20 }}>
                <h3>Description</h3>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 8 }}>
                  {selectedTicket.description || '-'}
                </div>
              </div>

              {(selectedTicket.attachments || []).length > 0 && (
                <div className="section-card" style={{ marginTop: 20 }}>
                  <h3>Attachments ({selectedTicket.attachments.length})</h3>
                  {selectedTicket.attachments.map((attachment) => (
                    <AttachmentRow key={attachment.attachment_id} attachment={attachment} />
                  ))}
                </div>
              )}

              <div className="section-card" style={{ marginTop: 20 }}>
                <h3>Change Status</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STATUS_ORDER.map((s) => {
                    const disabled =
                      selectedTicket.status === s || actionId === selectedTicket._id;
                    return (
                      <button
                        key={s}
                        className={`btn btn-sm ${selectedTicket.status === s ? 'btn-primary' : 'btn-secondary'}`}
                        disabled={disabled}
                        onClick={() => handleStatusChange(selectedTicket._id, s)}
                      >
                        {STATUS_LABELS[s] || s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="section-card" style={{ marginTop: 20 }}>
                <h3>Change Priority</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['low', 'medium', 'high'].map((p) => (
                    <button
                      key={p}
                      className={`btn btn-sm ${selectedTicket.priority === p ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={actionId === selectedTicket._id}
                      onClick={() => handlePriorityChange(selectedTicket._id, p)}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-card" style={{ marginTop: 20 }}>
                <h3>Add Response</h3>
                <form onSubmit={handleSendResponse} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type your response..."
                    rows={4}
                    className="note-area"
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
                <div className="section-card" style={{ marginTop: 20 }}>
                  <h3>Conversation</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {selectedTicket.comments.map((c, i) => (
                      <div key={i} style={{ border: '1px solid var(--border-light)', borderRadius: 8, padding: 12, background: c.author_type === 'support' ? 'var(--info-light)' : 'var(--bg-input)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: 6 }}>
                          <strong style={{ fontSize: 13 }}>
                            {c.author || (c.author_type === 'support' ? 'Support Team' : selectedTicket.person_label)}
                          </strong>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.created_at || ''}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                        {(c.attachments || []).map((attachment) => (
                          <AttachmentRow key={attachment.attachment_id} attachment={attachment} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
