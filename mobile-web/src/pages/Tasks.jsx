import { useCallback, useEffect, useState } from 'react';
import { FiClock, FiClipboard, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getMyTasks, updateTaskStatus } from '../services/api';

const FILTERS = ['All', 'Pending', 'In Progress', 'Completed'];

const PRIORITY_COLORS = {
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#10b981',
};

const STATUS_COLORS = {
  Pending: '#f59e0b',
  'In Progress': '#3b82f6',
  Completed: '#10b981',
};

function getPriorityColor(priority) {
  return PRIORITY_COLORS[priority] || '#94a3b8';
}

function getStatusColor(status) {
  return STATUS_COLORS[status] || '#94a3b8';
}

export default function Tasks() {
  const { employee, personType } = useAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');
  const [statusModal, setStatusModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadTasks = useCallback(async () => {
    try {
      const res = await getMyTasks(employee._id, personType);
      setTasks(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employee, personType]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTasks();
  };

  const handleStatusChange = async (taskId, nextStatus) => {
    try {
      await updateTaskStatus(taskId, nextStatus);
      setTasks((prev) =>
        prev.map((t) => (t._id === taskId ? { ...t, status: nextStatus } : t))
      );
      toast.success('Task status updated');
    } catch (err) {
      toast.error('Failed to update task status');
    }
  };

  const filteredTasks = filter === 'All' ? tasks : tasks.filter((t) => t.status === filter);

  const pendingCount = tasks.filter((t) => t.status === 'Pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'In Progress').length;
  const completedCount = tasks.filter((t) => t.status === 'Completed').length;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="tasks-header" style={{ position: 'relative' }}>
        <h2 className="header-title">My Tasks</h2>
        <button
          className="refresh-btn"
          onClick={onRefresh}
          aria-label="Refresh"
          style={{ position: 'absolute', right: 16 }}
        >
          <FiRefreshCw className={refreshing ? 'spin' : ''} size={18} />
        </button>
      </header>

      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-chip${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'All'
              ? `All (${tasks.length})`
              : f === 'Pending'
                ? `Pending (${pendingCount})`
                : f === 'In Progress'
                  ? `Active (${inProgressCount})`
                  : `Done (${completedCount})`}
          </button>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <FiClipboard size={48} />
          </div>
          <div className="empty-title">No Tasks</div>
          <p className="empty-text">
            {filter === 'All'
              ? 'No tasks assigned to you yet.'
              : `No ${filter.toLowerCase()} tasks.`}
          </p>
        </div>
      ) : (
        <div className="task-list">
          {filteredTasks.map((item) => {
            const statusColor = getStatusColor(item.status);
            return (
              <div className="task-card" key={item._id}>
                <div className="task-header">
                  <span className="task-title">{item.title}</span>
                  <button
                    className="status-chip"
                    style={{
                      backgroundColor: statusColor + '20',
                      color: statusColor,
                    }}
                    onClick={() => {
                      setSelectedTask(item);
                      setStatusModal(true);
                    }}
                  >
                    {item.status}
                  </button>
                </div>

                {item.description ? (
                  <p className="task-desc">{item.description}</p>
                ) : null}

                <div className="task-meta">
                  <div className="priority-badge">
                    <span
                      className="priority-dot"
                      style={{ backgroundColor: getPriorityColor(item.priority) }}
                    />
                    <span className="priority-text">{item.priority}</span>
                  </div>

                  {item.deadline ? (
                    <div className="deadline-row">
                      <FiClock size={14} />
                      <span>{item.deadline}</span>
                    </div>
                  ) : null}
                </div>

                {item.remarks ? (
                  <p className="task-remarks">Note: {item.remarks}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {statusModal && (
        <div className="modal-overlay" onClick={() => setStatusModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Select Status</div>
            {['Pending', 'In Progress', 'Completed'].map((status) => (
              <button
                key={status}
                className="modal-item"
                onClick={() => {
                  setStatusModal(false);
                  if (selectedTask) {
                    handleStatusChange(selectedTask._id, status);
                  }
                }}
              >
                <span
                  className="modal-indicator"
                  style={{ backgroundColor: getStatusColor(status) }}
                />
                {status}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
