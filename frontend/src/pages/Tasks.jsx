import { useState, useEffect } from 'react';
import {
  getTasks, createTask, updateTask, deleteTask, addTaskComment, getEmployees, getInterns,
} from '../services/services';
import { useAuth } from '../context/AuthContext';
import {
  HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineChatAlt2, HiOutlinePaperAirplane,
} from 'react-icons/hi';

const defaultForm = {
  title: '', description: '', assigned_to: '',
  priority: 'Medium', deadline: '', status: 'Pending', remarks: '',
};

const COMMENT_MAX = 5000;

const capitalizeFirst = (value) => {
  const text = String(value ?? '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

const formatMsgTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [interns, setInterns] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [messaging, setMessaging] = useState(null);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgError, setMsgError] = useState('');

  useEffect(() => {
    loadTasks();
    loadEmployees();
    loadInterns();
  }, [search]);

  const loadTasks = async () => {
    try {
      const res = await getTasks(search || undefined);
      setTasks(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadEmployees = async () => {
    try {
      const res = await getEmployees();
      setEmployees(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadInterns = async () => {
    try {
      const res = await getInterns();
      setInterns(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const openAdd = () => {
    setForm(defaultForm);
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (task) => {
    setForm({ ...defaultForm, ...task, assigned_type: task.assigned_type || 'employee' });
    setEditing(task._id);
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = { ...form, title: capitalizeFirst(form.title.trim()) };
    try {
      if (editing) {
        await updateTask(editing, payload);
      } else {
        await createTask(payload);
      }
      setShowModal(false);
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await deleteTask(id);
        loadTasks();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const openMessages = (task) => {
    setMessaging(task);
    setMsgText('');
    setMsgError('');
  };

  const handleSendMsg = async () => {
    if (!messaging || !msgText.trim() || msgSending) return;
    setMsgSending(true);
    setMsgError('');
    try {
      const res = await addTaskComment(messaging._id, {
        body: msgText.trim(),
        author: user?.name || user?.username || 'Administrator',
        author_type: 'admin',
      });
      const updated = res.data.task;
      setMessaging(updated);
      setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
      setMsgText('');
    } catch (err) {
      setMsgError(err?.response?.data?.error || 'Unable to send the message. Please try again.');
    } finally {
      setMsgSending(false);
    }
  };

  const priorityBadge = (priority) => {
    const cls = priority?.toLowerCase() || 'medium';
    return <span className={`badge badge-${cls}`}>{priority}</span>;
  };

  const statusBadge = (status) => {
    const map = { 'Pending': 'pending', 'In Progress': 'progress', 'Completed': 'completed' };
    return <span className={`badge badge-${map[status] || 'pending'}`}>{status}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Tasks</h2>
          <p>{tasks.length} task(s) found</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>
            <HiOutlinePlus size={16} /> Create Task
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ width: 300 }}>
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Assigned To</th>
                <th>Priority</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>Messages</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No tasks found.</td></tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task._id}>
                    <td><strong>{task.title}</strong></td>
                    <td>{task.assigned_to_name || '-'}</td>
                    <td>{priorityBadge(task.priority)}</td>
                    <td>{task.deadline || '-'}</td>
                    <td>{statusBadge(task.status)}</td>
                    <td>{task.remarks || '-'}</td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openMessages(task)}
                        title="Open messages"
                      >
                        <HiOutlineChatAlt2 size={14} /> {task.comments?.length || 0}
                      </button>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-icon btn-sm" onClick={() => openEdit(task)}>
                          <HiOutlinePencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(task._id)}>
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Task' : 'Create Task'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Title *</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: capitalizeFirst(e.target.value) })} />
                </div>
                <div className="form-group full-width">
                  <label>Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Assign To</label>
                  <select value={form.assigned_to} onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setForm({ ...form, assigned_to: '', assigned_type: 'employee' });
                      return;
                    }
                    const assignedType = employees.some(e => e._id === id) ? 'employee' : 'intern';
                    setForm({ ...form, assigned_to: id, assigned_type: assignedType });
                  }}>
                    <option value="">Select Person</option>
                    {employees.map((emp) => (
                      <option key={`emp-${emp._id}`} value={emp._id}>{emp.name} (Employee)</option>
                    ))}
                    {interns.map((intern) => (
                      <option key={`int-${intern._id}`} value={intern._id}>{intern.name} (Intern)</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Deadline</label>
                  <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                </div>
                <div className="form-group full-width">
                  <label>Remarks</label>
                  <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editing ? 'Update' : 'Create'} Task
              </button>
            </div>
          </div>
        </div>
      )}

      {messaging && (
        <div className="modal-overlay" onClick={() => setMessaging(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Messages &middot; {messaging.title}</h3>
              <button className="modal-close" onClick={() => setMessaging(null)}>&times;</button>
            </div>
            <div className="modal-body">
              {(messaging.comments || []).length === 0 ? (
                <div className="task-msg-empty">
                  No messages yet. Send the first message below.
                </div>
              ) : (
                <div className="task-msg-list">
                  {messaging.comments.map((comment, index) => (
                    <div
                      key={`${comment.created_at || ''}-${index}`}
                      className={`task-msg${comment.author_type === 'admin' ? ' task-msg-mine' : ''}`}
                    >
                      <div className="task-msg-head">
                        <span className="task-msg-author">{comment.author}</span>
                        <span className="task-msg-time">{formatMsgTime(comment.created_at)}</span>
                      </div>
                      <div className="task-msg-body">{comment.body}</div>
                    </div>
                  ))}
                </div>
              )}

              {msgError && <div className="task-msg-error">{msgError}</div>}

              <div className="form-group full-width">
                <label>Reply</label>
                <textarea
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Write a message to the assigned person..."
                  maxLength={COMMENT_MAX}
                  rows={3}
                />
              </div>
              <div className="task-msg-count">
                {msgText.trim().length} / {COMMENT_MAX.toLocaleString()}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setMessaging(null)}>Close</button>
              <button
                className="btn btn-primary"
                disabled={!msgText.trim() || msgSending}
                onClick={handleSendMsg}
              >
                <HiOutlinePaperAirplane size={14} /> {msgSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
