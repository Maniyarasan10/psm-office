import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getEmployees,
  getInterns,
  getAnnouncement,
  saveAnnouncement,
  deleteAnnouncement,
  getAnnouncementSenders,
  updateAnnouncementSenders,
} from '../services/services';
import {
  HiOutlineSave,
  HiOutlineSpeakerphone,
  HiOutlineSearch,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineTrash,
} from 'react-icons/hi';

const personKey = (type, id) => `${type}:${id}`;

export default function Announcements() {
  const [employees, setEmployees] = useState([]);
  const [interns, setInterns] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [savingSenders, setSavingSenders] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [search, setSearch] = useState('');

  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState(null);

  const [announcements, setAnnouncements] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [empRes, intRes, sendersRes, annRes] = await Promise.all([
        getEmployees(),
        getInterns(),
        getAnnouncementSenders(),
        getAnnouncement(),
      ]);
      setEmployees(empRes.data || []);
      setInterns(intRes.data || []);
      const keys = new Set(
        (sendersRes.data.senders || []).map((s) => personKey(s.person_type, s.person_id))
      );
      setSelected(keys);
      const items = annRes.data.announcements || [];
      setAnnouncements(items);
      setTopic(items[0]?.topic || '');
      const existing = annRes.data.announcement || '';
      setContent(existing === 'Welcome to PSM Office!' ? '' : existing);
    } catch (err) {
      console.error('Failed to load announcements data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnnouncementLog = useCallback(async () => {
    try {
      const res = await getAnnouncement();
      setAnnouncements(res.data.announcements || []);
    } catch {
      // Keep the current log; the next poll retries.
    }
  }, []);

  // While this page stays open, pick up announcements published elsewhere.
  useEffect(() => {
    const timer = setInterval(() => {
      void loadAnnouncementLog();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadAnnouncementLog]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.employee_id || '').toLowerCase().includes(q)
    );
  }, [employees, search]);

  const filteredInterns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return interns;
    return interns.filter(
      (i) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.intern_id || '').toLowerCase().includes(q)
    );
  }, [interns, search]);

  const handleSaveSenders = async () => {
    setSavingSenders(true);
    setSavedMsg(null);
    try {
      const senders = [];
      employees.forEach((e) => {
        if (selected.has(personKey('employee', e._id))) {
          senders.push({ person_id: e._id, person_type: 'employee', name: e.name });
        }
      });
      interns.forEach((i) => {
        if (selected.has(personKey('intern', i._id))) {
          senders.push({ person_id: i._id, person_type: 'intern', name: i.name });
        }
      });
      await updateAnnouncementSenders(senders);
      setSavedMsg({ type: 'success', text: `Saved. ${senders.length} people can send announcements.` });
    } catch (err) {
      setSavedMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save senders.' });
    } finally {
      setSavingSenders(false);
      setTimeout(() => setSavedMsg(null), 4000);
    }
  };

  const handlePublish = async () => {
    if (!topic.trim()) {
      setPublishMsg({ type: 'error', text: 'Topic cannot be empty.' });
      setTimeout(() => setPublishMsg(null), 4000);
      return;
    }
    if (!content.trim()) {
      setPublishMsg({ type: 'error', text: 'Announcement cannot be empty.' });
      setTimeout(() => setPublishMsg(null), 4000);
      return;
    }
    setPublishing(true);
    setPublishMsg(null);
    try {
      await saveAnnouncement({ topic, content });
      const res = await getAnnouncement();
      setAnnouncements(res.data.announcements || []);
      setPublishMsg({ type: 'success', text: 'Announcement published to everyone.' });
    } catch (err) {
      setPublishMsg({ type: 'error', text: err.response?.data?.error || 'Failed to publish announcement.' });
    } finally {
      setPublishing(false);
      setTimeout(() => setPublishMsg(null), 4000);
    }
  };

  const handleDelete = async (item) => {
    if (!item?._id) return;
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return;
    setDeletingId(item._id);
    try {
      await deleteAnnouncement(item._id);
      const res = await getAnnouncement();
      const items = res.data.announcements || [];
      setAnnouncements(items);
      setTopic(items[0]?.topic || '');
      const latest = res.data.announcement || '';
      setContent(latest === 'Welcome to PSM Office!' ? '' : latest);
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to delete the announcement.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatAnnouncementDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
  };

  const renderPerson = (type, id, name, subId) => {
    const key = personKey(type, id);
    const checked = selected.has(key);
    return (
      <label
        key={key}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          borderRadius: 8,
          cursor: 'pointer',
          background: checked ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
        }}
      >
        <input type="checkbox" checked={checked} onChange={() => toggle(key)} />
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{name || 'Unnamed'}</div>
          {subId ? (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{subId}</div>
          ) : null}
        </div>
      </label>
    );
  };

  const groupLabel = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--text-tertiary)',
    padding: '8px 10px 4px',
  };

  if (loading) return <div className="empty-state">Loading announcements...</div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Announcements</h2>
          <p>Choose who is allowed to send announcements, and publish an update for everyone.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="section-card">
          <h3>
            <HiOutlineSpeakerphone size={16} /> Who can send announcements
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Selected people can post announcements from the mobile app. Administrators can always post.
          </p>
          <div className="search-bar" style={{ width: '100%', marginBottom: 12 }}>
            <HiOutlineSearch size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
            />
          </div>
          <div
            style={{
              maxHeight: 420,
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              padding: 6,
            }}
          >
            {filteredEmployees.length === 0 && filteredInterns.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>
                No people found.
              </div>
            ) : (
              <>
                {filteredEmployees.length > 0 && (
                  <>
                    <div style={groupLabel}>Employees</div>
                    {filteredEmployees.map((e) =>
                      renderPerson('employee', e._id, e.name, e.employee_id)
                    )}
                  </>
                )}
                {filteredInterns.length > 0 && (
                  <>
                    <div style={groupLabel}>Interns</div>
                    {filteredInterns.map((i) =>
                      renderPerson('intern', i._id, i.name, i.intern_id)
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleSaveSenders} disabled={savingSenders}>
              <HiOutlineSave size={14} /> {savingSenders ? 'Saving...' : 'Save Allowed Senders'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {selected.size} selected
            </span>
            {savedMsg && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: savedMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {savedMsg.text}
              </span>
            )}
          </div>
        </div>

        <div className="section-card">
          <h3>
            <HiOutlineCheckCircle size={16} /> Current announcement
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            This message is shown on the mobile app home screen. Publishing notifies everyone.
          </p>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Announcement topic"
              maxLength={120}
            />
          </div>
          <textarea
            className="note-area"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type the announcement here..."
            rows={7}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
              <HiOutlineSpeakerphone size={14} /> {publishing ? 'Publishing...' : 'Publish Announcement'}
            </button>
            {publishMsg && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: publishMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {publishMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginTop: 20 }}>
        <h3>
          <HiOutlineClock size={16} /> Announcement log
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Every published announcement, newest first. Deleting one removes it from the log.
        </p>
        {announcements.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            No announcements yet.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 220 }}>Topic</th>
                  <th>Message</th>
                  <th style={{ width: 160 }}>Sent by</th>
                  <th style={{ width: 180 }}>Date</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((item) => (
                  <tr key={item._id}>
                    <td><strong>{item.topic || '-'}</strong></td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{item.content}</td>
                    <td>{item.author_name || 'Administrator'}</td>
                    <td>{formatAnnouncementDate(item.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-danger btn-icon btn-sm"
                          onClick={() => handleDelete(item)}
                          disabled={deletingId === item._id}
                          title="Delete announcement"
                        >
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
