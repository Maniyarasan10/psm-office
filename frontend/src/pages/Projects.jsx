import { useState, useEffect } from 'react';
import {
  getProjects, createProject, updateProject, deleteProject, getEmployees, getInterns,
} from '../services/services';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineLockClosed } from 'react-icons/hi';

const STATUS_OPTIONS = ['Ongoing', 'On Hold', 'Completed'];

const STATUS_BADGE = {
  'Ongoing': 'progress',
  'On Hold': 'pending',
  'Completed': 'completed',
};

const capitalizeFirst = (value) => {
  const text = String(value ?? '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

const defaultForm = {
  title: '', description: '', status: 'Ongoing', progress: 0,
  team_lead_id: '', team_lead_type: 'employee',
  members: [], start_date: '', deadline: '',
  is_confidential: false, allowed_intern_ids: [],
};

const progressTone = (value) => {
  if (value >= 100) return '#22c55e';
  if (value >= 60) return '#3b82f6';
  if (value >= 30) return '#f59e0b';
  return '#ef4444';
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [interns, setInterns] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadProjects();
  }, [search]);

  useEffect(() => {
    loadPeople();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await getProjects(search || undefined);
      setProjects(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPeople = async () => {
    try {
      const [empRes, intRes] = await Promise.all([getEmployees(), getInterns()]);
      setEmployees(empRes.data);
      setInterns(intRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const openAdd = () => {
    setForm(defaultForm);
    setEditing(null);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (project) => {
    setForm({
      title: project.title || '',
      description: project.description || '',
      status: project.status || 'Ongoing',
      progress: project.progress ?? 0,
      team_lead_id: project.team_lead_id || '',
      team_lead_type: project.team_lead_type || 'employee',
      members: (project.members_detail || []).map((m) => ({
        person_id: m.person_id, person_type: m.person_type,
      })),
      start_date: project.start_date || '',
      deadline: project.deadline || '',
      is_confidential: Boolean(project.is_confidential),
      allowed_intern_ids: project.allowed_intern_ids || [],
    });
    setEditing(project._id);
    setFormError('');
    setShowModal(true);
  };

  const handleLeadChange = (id) => {
    if (!id) {
      setForm((prev) => ({ ...prev, team_lead_id: '', team_lead_type: 'employee' }));
      return;
    }
    const personType = employees.some((e) => e._id === id) ? 'employee' : 'intern';
    setForm((prev) => ({ ...prev, team_lead_id: id, team_lead_type: personType }));
  };

  const toggleMember = (id, personType) => {
    setForm((prev) => {
      const exists = prev.members.some(
        (m) => m.person_id === id && m.person_type === personType
      );
      const members = exists
        ? prev.members.filter((m) => !(m.person_id === id && m.person_type === personType))
        : [...prev.members, { person_id: id, person_type: personType }];
      return { ...prev, members };
    });
  };

  const isMember = (id, personType) =>
    form.members.some((m) => m.person_id === id && m.person_type === personType);

  const toggleAllowedIntern = (id) => {
    setForm((prev) => {
      const exists = prev.allowed_intern_ids.includes(id);
      const allowed_intern_ids = exists
        ? prev.allowed_intern_ids.filter((value) => value !== id)
        : [...prev.allowed_intern_ids, id];
      return { ...prev, allowed_intern_ids };
    });
  };

  const isAllowedIntern = (id) => form.allowed_intern_ids.includes(id);

  const handleSave = async () => {
    const title = capitalizeFirst(form.title.trim());
    if (!title) {
      setFormError('Project title is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        title,
        progress: Number(form.progress) || 0,
        allowed_intern_ids: form.is_confidential ? form.allowed_intern_ids : [],
      };
      if (editing) {
        await updateProject(editing, payload);
      } else {
        await createProject(payload);
      }
      setShowModal(false);
      loadProjects();
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Unable to save the project.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this project?')) {
      try {
        await deleteProject(id);
        loadProjects();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const statusBadge = (status) => (
    <span className={`badge badge-${STATUS_BADGE[status] || 'pending'}`}>{status}</span>
  );

  const progressCell = (value) => (
    <div style={{ minWidth: 120 }}>
      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${value}%`, background: progressTone(value) }}
        />
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>{value}%</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Projects</h2>
          <p>{projects.length} project(s) found</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>
            <HiOutlinePlus size={16} /> Create Project
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ width: 300 }}>
          <input
            type="text"
            placeholder="Search projects..."
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
                <th>Project</th>
                <th>Team Lead</th>
                <th>Members</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Deadline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">No projects found.</td></tr>
              ) : (
                projects.map((project) => (
                  <tr key={project._id}>
                    <td>
                      <strong>{project.title}</strong>
                      {project.is_confidential && (
                        <span
                          className="badge badge-pending"
                          style={{ marginLeft: 8, verticalAlign: 'middle' }}
                          title="Confidential — hidden from interns unless allowed"
                        >
                          <HiOutlineLockClosed size={12} style={{ verticalAlign: '-2px' }} /> Confidential
                        </span>
                      )}
                      {project.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {project.description}
                        </div>
                      )}
                    </td>
                    <td>{project.team_lead_name || '-'}</td>
                    <td>{project.member_count || 0}</td>
                    <td>{progressCell(project.progress ?? 0)}</td>
                    <td>{statusBadge(project.status)}</td>
                    <td>{project.deadline || '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-icon btn-sm" onClick={() => openEdit(project)}>
                          <HiOutlinePencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(project._id)}>
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
              <h3>{editing ? 'Edit Project' : 'Create Project'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Project Title *</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: capitalizeFirst(e.target.value) })} />
                </div>
                <div className="form-group full-width">
                  <label>Description</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Team Lead</label>
                  <select value={form.team_lead_id} onChange={(e) => handleLeadChange(e.target.value)}>
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
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Progress · {form.progress}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={form.progress}
                    onChange={(e) => setForm({ ...form, progress: e.target.value })}
                  />
                  <div className="progress-bar-container" style={{ marginTop: 8 }}>
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${form.progress}%`, background: progressTone(Number(form.progress)) }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Deadline</label>
                  <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                </div>
                <div className="form-group full-width">
                  <label>Members · {form.members.length} selected</label>
                  <div className="member-picker">
                    <div className="member-picker-group">Employees</div>
                    {employees.length === 0 && <div className="member-picker-empty">No employees.</div>}
                    {employees.map((emp) => (
                      <label key={`memp-${emp._id}`} className="member-option">
                        <input
                          type="checkbox"
                          checked={isMember(emp._id, 'employee')}
                          onChange={() => toggleMember(emp._id, 'employee')}
                        />
                        <span>{emp.name}</span>
                      </label>
                    ))}
                    <div className="member-picker-group">Interns</div>
                    {interns.length === 0 && <div className="member-picker-empty">No interns.</div>}
                    {interns.map((intern) => (
                      <label key={`mint-${intern._id}`} className="member-option">
                        <input
                          type="checkbox"
                          checked={isMember(intern._id, 'intern')}
                          onChange={() => toggleMember(intern._id, 'intern')}
                        />
                        <span>{intern.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-group full-width">
                  <label className="member-option" style={{ fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={form.is_confidential}
                      onChange={(e) => setForm({ ...form, is_confidential: e.target.checked })}
                    />
                    <span>Confidential project</span>
                  </label>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Confidential projects are hidden from all interns except the interns you
                    allow below.
                  </div>
                  {form.is_confidential && (
                    <div className="member-picker" style={{ marginTop: 12 }}>
                      <div className="member-picker-group">
                        Allowed interns · {form.allowed_intern_ids.length} selected
                      </div>
                      {interns.length === 0 && (
                        <div className="member-picker-empty">No interns.</div>
                      )}
                      {interns.map((intern) => (
                        <label key={`allow-${intern._id}`} className="member-option">
                          <input
                            type="checkbox"
                            checked={isAllowedIntern(intern._id)}
                            onChange={() => toggleAllowedIntern(intern._id)}
                          />
                          <span>{intern.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {formError && <div className="task-msg-error">{formError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : `${editing ? 'Update' : 'Create'} Project`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
