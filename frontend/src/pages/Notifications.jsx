import { useState, useEffect, useMemo } from 'react';
import {
  getEmployees, getInterns, sendCustomNotification, getCustomNotificationLog,
} from '../services/services';
import {
  HiOutlineBell, HiOutlineClock, HiOutlinePaperAirplane, HiOutlineUsers,
  HiOutlineSearch,
} from 'react-icons/hi';

const personKey = (type, doc) => `${type}:${doc._id}`;

export default function Notifications() {
  const [employees, setEmployees] = useState([]);
  const [interns, setInterns] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const [empRes, intRes, logRes] = await Promise.allSettled([
      getEmployees(),
      getInterns(),
      getCustomNotificationLog(),
    ]);
    const failed = [];
    if (empRes.status === 'fulfilled') {
      setEmployees(Array.isArray(empRes.value.data) ? empRes.value.data : []);
    } else {
      failed.push('employees');
    }
    if (intRes.status === 'fulfilled') {
      setInterns(Array.isArray(intRes.value.data) ? intRes.value.data : []);
    } else {
      failed.push('interns');
    }
    if (logRes.status === 'fulfilled') {
      setLog(Array.isArray(logRes.value.data) ? logRes.value.data : []);
    } else {
      failed.push('sent notifications');
    }
    setLoadError(failed.length ? `Could not load ${failed.join(', ')}.` : '');
    setLoading(false);
  };

  const refreshLog = async () => {
    try {
      const res = await getCustomNotificationLog();
      setLog(res.data || []);
    } catch (err) {
      console.error('Failed to load notification log:', err);
    }
  };

  const recipientCount = employees.length + interns.length;

  const people = useMemo(() => ([
    ...employees.map((doc) => ({
      key: personKey('employee', doc),
      type: 'employee',
      name: doc.name || 'Unnamed employee',
      identifier: doc.employee_id || doc.email || '',
      meta: [doc.designation, doc.department].filter(Boolean).join(' · '),
    })),
    ...interns.map((doc) => ({
      key: personKey('intern', doc),
      type: 'intern',
      name: doc.name || 'Unnamed intern',
      identifier: doc.intern_id || doc.email || '',
      meta: [doc.designation, doc.department].filter(Boolean).join(' · '),
    })),
  ]), [employees, interns]);

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return people;
    return people.filter((person) => (
      [person.name, person.identifier, person.meta]
        .some((value) => String(value || '').toLowerCase().includes(query))
    ));
  }, [people, search]);

  const visibleEmployees = filteredPeople.filter((person) => person.type === 'employee');
  const visibleInterns = filteredPeople.filter((person) => person.type === 'intern');
  const allVisibleSelected = filteredPeople.length > 0
    && filteredPeople.every((person) => selected.includes(person.key));

  const togglePerson = (key) => {
    setSelected((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ));
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleKeys = new Set(filteredPeople.map((person) => person.key));
      setSelected((prev) => prev.filter((key) => !visibleKeys.has(key)));
    } else {
      setSelected((prev) => Array.from(new Set([
        ...prev, ...filteredPeople.map((person) => person.key),
      ])));
    }
  };

  const clearSelection = () => setSelected([]);

  const targetCount = sendToAll ? recipientCount : selected.length;

  const handleSend = async () => {
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Notification title is required.' });
      return;
    }
    if (!sendToAll && selected.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one recipient.' });
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        send_to_all: sendToAll,
      };
      if (!sendToAll) {
        payload.recipients = selected.map((key) => {
          const [person_type, person_id] = key.split(':');
          return { person_type, person_id };
        });
      }
      const res = await sendCustomNotification(payload);
      const sent = res.data?.recipients ?? targetCount;
      setMessage({
        type: 'success',
        text: `Notification sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`,
      });
      setTitle('');
      setBody('');
      setSelected([]);
      await refreshLog();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to send the notification.',
      });
    } finally {
      setSending(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
  };

  if (loading) return <div className="empty-state">Loading notifications...</div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Custom Notifications</h2>
          <p>Send a custom notification to everyone or choose specific employees and interns.</p>
        </div>
        <div className="page-header-right">
          <span className="badge badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <HiOutlineUsers size={14} /> {targetCount} {targetCount === 1 ? 'recipient' : 'recipients'}
          </span>
        </div>
      </div>

      <div className="grid-2">
        <div className="section-card">
          <h3><HiOutlineBell size={16} /> Compose Notification</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            {sendToAll
              ? `This is delivered to every employee (${employees.length}) and intern (${interns.length}) in their notification inbox and as a push notification.`
              : `This is delivered only to the ${selected.length} selected ${selected.length === 1 ? 'person' : 'people'} in their notification inbox and as a push notification.`}
          </p>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              maxLength={120}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Message</label>
            <textarea
              className="note-area"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type the notification message here..."
              rows={6}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={sending || (!sendToAll && selected.length === 0)}
            >
              <HiOutlinePaperAirplane size={14} />
              {' '}
              {sending
                ? 'Sending...'
                : sendToAll
                  ? 'Send to All'
                  : `Send to ${selected.length} Selected`}
            </button>
            {message && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {message.text}
              </span>
            )}
          </div>
        </div>

        <div className="section-card">
          <h3><HiOutlineUsers size={16} /> Recipients</h3>
          {loadError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              <span>{loadError}</span>
              <button className="btn btn-sm" type="button" onClick={load}>Retry</button>
            </div>
          )}
          <label className="member-option" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={sendToAll}
              onChange={(e) => setSendToAll(e.target.checked)}
            />
            <span>
              <strong>Send to everyone</strong>
              <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                {employees.length} employees · {interns.length} interns
              </span>
            </span>
          </label>

          {!sendToAll && (
            <>
              <div className="search-bar" style={{ marginBottom: 10 }}>
                <HiOutlineSearch size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, ID or department"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button className="btn btn-sm" type="button" onClick={toggleSelectAllVisible}>
                  {allVisibleSelected ? 'Unselect all' : 'Select all'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {selected.length} selected
                  </span>
                  <button className="btn btn-sm" type="button" onClick={clearSelection} disabled={!selected.length}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="member-picker" style={{ maxHeight: 300 }}>
                {filteredPeople.length === 0 ? (
                  <div className="member-picker-empty">
                    {people.length === 0
                      ? 'No employees or interns found.'
                      : 'No matching employees or interns.'}
                  </div>
                ) : (
                  <>
                    {visibleEmployees.length > 0 && (
                      <>
                        <div className="member-picker-group">Employees</div>
                        {visibleEmployees.map((person) => (
                          <label key={person.key} className="member-option">
                            <input
                              type="checkbox"
                              checked={selected.includes(person.key)}
                              onChange={() => togglePerson(person.key)}
                            />
                            <span>
                              {person.name}
                              <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                                {[person.identifier, person.meta].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </label>
                        ))}
                      </>
                    )}
                    {visibleInterns.length > 0 && (
                      <>
                        <div className="member-picker-group">Interns</div>
                        {visibleInterns.map((person) => (
                          <label key={person.key} className="member-option">
                            <input
                              type="checkbox"
                              checked={selected.includes(person.key)}
                              onChange={() => togglePerson(person.key)}
                            />
                            <span>
                              {person.name}
                              <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                                {[person.identifier, person.meta].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </label>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section-card" style={{ marginTop: 20 }}>
        <h3><HiOutlineClock size={16} /> Sent Notifications</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Recently sent custom notifications, newest first.
        </p>
        {log.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            No custom notifications sent yet.
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 220 }}>Title</th>
                  <th>Message</th>
                  <th style={{ width: 110 }}>Recipients</th>
                  <th style={{ width: 110 }}>Pushed</th>
                  <th style={{ width: 180 }}>Sent</th>
                </tr>
              </thead>
              <tbody>
                {log.map((item) => (
                  <tr key={item._id}>
                    <td><strong>{item.title}</strong></td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{item.body || '-'}</td>
                    <td>{item.recipients ?? '-'}</td>
                    <td>{item.pushed ?? '-'}</td>
                    <td>{formatDate(item.sent_at)}</td>
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
