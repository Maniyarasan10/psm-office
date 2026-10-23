import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard, saveNote as saveNoteApi, attendancePhotoUrl } from '../services/services';
import { formatDistanceToNow } from 'date-fns';
import {
  HiOutlineUsers, HiOutlineUserGroup, HiOutlineCheckCircle,
  HiOutlineExclamationCircle, HiOutlineGlobeAlt, HiOutlineClock,
  HiOutlineCheck, HiOutlinePlus, HiOutlineDocumentText,
  HiOutlineFolder, HiOutlinePencil, HiOutlineClipboardCheck,
} from 'react-icons/hi';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await getDashboard();
      setData(res.data);
      setNoteContent(res.data.note?.content || '');
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    try {
      await saveNoteApi({ content: noteContent });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  if (loading) return <div className="empty-state">Loading dashboard...</div>;
  if (!data) return <div className="empty-state">Failed to load dashboard data.</div>;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-number">
            {data.total_workforce ?? ((data.total_employees || 0) + (data.total_interns || 0))}
          </div>
          <div className="stat-label">Total Employees (incl. interns)</div>
        </div>
        <div className="stat-card info">
          <div className="stat-number">{data.total_employees}</div>
          <div className="stat-label">Employees</div>
        </div>
        <div className="stat-card info">
          <div className="stat-number">{data.total_interns}</div>
          <div className="stat-label">Interns</div>
        </div>
        <div className="stat-card success">
          <div className="stat-number">{data.present_today}</div>
          <div className="stat-label">Present Today</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-number">{data.absent_today}</div>
          <div className="stat-label">Absent Today</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-number">{data.remote_workers}</div>
          <div className="stat-label">Remote Workers</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-number">{data.tasks_pending}</div>
          <div className="stat-label">Tasks Pending</div>
        </div>
        <div className="stat-card success">
          <div className="stat-number">{data.tasks_completed}</div>
          <div className="stat-label">Tasks Completed</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="section-card">
          <h3>Today's Attendance</h3>
          {data.today_attendance && data.today_attendance.length > 0 ? (
            <div className="activity-list">
              {data.today_attendance.map((att, idx) => (
                <div className="activity-item" key={idx}>
                  <div className="activity-dot" style={{ background: att.status === 'Present' ? 'var(--success)' : att.status === 'Absent' ? 'var(--danger)' : 'var(--warning)' }}></div>
                  {att.photo_path && (
                    <img
                      src={attendancePhotoUrl(att.photo_path)}
                      alt=""
                      style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div>
                    <div className="activity-text">{att.name || att.person_id}</div>
                    <div className="activity-time">{att.status} {att.clock_in ? `- In: ${att.clock_in}` : ''} {att.clock_out ? `Out: ${att.clock_out}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px' }}>No attendance records today.</div>
          )}
        </div>

        <div className="section-card">
          <h3>Upcoming Tasks</h3>
          {data.upcoming_tasks && data.upcoming_tasks.length > 0 ? (
            <div className="task-list">
              {data.upcoming_tasks.map((task, idx) => (
                <div className="task-item" key={idx}>
                  <div>
                    <div className="task-item-title">{task.title}</div>
                    <div className="task-item-meta">
                      {task.assigned_to_name && `Assigned: ${task.assigned_to_name}`}
                      {task.deadline && ` | Due: ${task.deadline}`}
                    </div>
                  </div>
                  <span className={`badge badge-${task.priority?.toLowerCase()}`}>{task.priority}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px' }}>No upcoming tasks.</div>
          )}
        </div>
      </div>

      <div style={{ height: 20 }}></div>

      <div className="grid-2">
        <div className="section-card">
          <h3>Quick Actions</h3>
          <div className="quick-actions">
            <button className="quick-action-btn" onClick={() => navigate('/employees')}>
              <HiOutlinePlus size={16} /> Add Employee
            </button>
            <button className="quick-action-btn" onClick={() => navigate('/attendance')}>
              <HiOutlineClipboardCheck size={16} /> Mark Attendance
            </button>
            <button className="quick-action-btn" onClick={() => navigate('/documents')}>
              <HiOutlineFolder size={16} /> Upload File
            </button>
            <button className="quick-action-btn" onClick={() => navigate('/tasks')}>
              <HiOutlinePlus size={16} /> Create Task
            </button>
          </div>
        </div>

        <div className="section-card">
          <h3>Sticky Notes</h3>
          <textarea
            className="note-area"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            onBlur={handleSaveNote}
            placeholder="Type your notes here..."
          />
        </div>
      </div>

      <div style={{ height: 20 }}></div>

      <div className="grid-2">
        <div className="section-card">
          <h3>Recent Activity</h3>
          {data.recent_activity && data.recent_activity.length > 0 ? (
            <div className="activity-list">
              {data.recent_activity.map((act, idx) => (
                <div className="activity-item" key={idx}>
                  <div className="activity-dot"></div>
                  <div>
                    <div className="activity-text">{act.action}</div>
                    <div className="activity-time">
                      {act.details && `${act.details} - `}
                      {act.timestamp ? formatDistanceToNow(new Date(act.timestamp), { addSuffix: true }) : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px' }}>No recent activity.</div>
          )}
        </div>

        <div className="section-card">
          <h3>Upcoming Birthdays</h3>
          {data.upcoming_birthdays && data.upcoming_birthdays.length > 0 ? (
            <div className="activity-list">
              {data.upcoming_birthdays.map((bday, idx) => (
                <div className="activity-item" key={idx}>
                  <div className="activity-dot" style={{ background: 'var(--warning)' }}></div>
                  <div>
                    <div className="activity-text">{bday.name}</div>
                    <div className="activity-time">
                      {bday.days_until === 0 ? 'Today!' : `In ${bday.days_until} day(s)`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px' }}>No upcoming birthdays in the next 30 days.</div>
          )}
        </div>
      </div>
    </div>
  );
}
