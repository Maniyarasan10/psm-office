import { useState, useEffect, useRef, useMemo } from 'react';
import {
  getEmployees, getNextEmployeeId, createEmployee, updateEmployee, deleteEmployee,
  uploadProfilePhoto, profilePhotoUrl, sendPasswordResetOtp,
} from '../services/services';
import { DEPARTMENTS, WORK_MODES, designationsFor, allDesignations } from '../constants/options';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineCamera } from 'react-icons/hi';

const defaultForm = {
  employee_id: '', name: '', phone: '', email: '',
  department: '', designation: '', joining_date: '',
  dob: '', status: 'Active', notes: '', photo_path: '', password: '',
  work_mode: '', current_project: '', github: '',
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoError, setPhotoError] = useState(false);
  const [imgErrors, setImgErrors] = useState({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);
  const latestPhotoPathRef = useRef('');

  const designationOptions = useMemo(() => {
    const base = form.department ? designationsFor(form.department) : allDesignations();
    if (form.designation && !base.includes(form.designation)) {
      return [form.designation, ...base];
    }
    return base;
  }, [form.department, form.designation]);

  useEffect(() => {
    loadEmployees();
  }, [search]);

  const loadEmployees = async () => {
    try {
      const res = await getEmployees(search || undefined);
      const sorted = [...(res.data || [])].sort((a, b) =>
        String(a.employee_id || '').localeCompare(String(b.employee_id || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );
      setEmployees(sorted);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const res = await uploadProfilePhoto(file);
      const path = res.data.photo_path;
      const resolved = profilePhotoUrl(path);
      latestPhotoPathRef.current = path;
      setForm(prev => ({ ...prev, photo_path: path }));
      setPhotoPreview(resolved);
      setPhotoError(false);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        latestPhotoPathRef.current = dataUrl;
        setForm(prev => ({ ...prev, photo_path: dataUrl }));
        setPhotoPreview(dataUrl);
        setPhotoError(false);
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openAdd = async () => {
    latestPhotoPathRef.current = '';
    setForm(defaultForm);
    setPhotoPreview(null);
    setPhotoError(false);
    setEditing(null);
    setShowModal(true);
    try {
      const res = await getNextEmployeeId();
      const nextId = res.data?.next_id;
      if (nextId) {
        setForm((prev) => (prev.employee_id ? prev : { ...prev, employee_id: nextId }));
      }
    } catch {
      // Leave blank; the server assigns an ID on save if it's still empty.
    }
  };

  const openEdit = (emp) => {
    latestPhotoPathRef.current = emp.photo_path || '';
    setForm({ ...defaultForm, ...emp });
    setPhotoPreview(profilePhotoUrl(emp.photo_path));
    setPhotoError(false);
    setEditing(emp._id);
    setShowModal(true);
  };

  const handleDepartmentChange = (department) => {
    setForm((prev) => {
      const keepDesignation =
        !department || !prev.designation || designationsFor(department).includes(prev.designation);
      return {
        ...prev,
        department,
        designation: keepDesignation ? prev.designation : '',
      };
    });
  };

  const handleSave = async () => {
    const selectedPhoto = latestPhotoPathRef.current || form.photo_path || '';

    if (uploadingPhoto && !selectedPhoto) {
      window.alert('Please wait for the photo upload to finish before saving.');
      return;
    }

    try {
      const { _id, created_at, updated_at, ...cleanForm } = form;
      const payload = { ...cleanForm, photo_path: selectedPhoto };
      if (editing) {
        await updateEmployee(editing, payload);
      } else {
        const res = await createEmployee(payload);
        const info = res.data || {};
        const lines = [`Employee ${info.employee_id} added.`];
        if (info.generated_password) {
          lines.push(`Generated password: ${info.generated_password}`);
        }
        if (payload.email) {
          lines.push(
            info.email_sent
              ? `Credentials emailed to ${payload.email}.`
              : `Email not sent: ${info.email_reason || 'email is not configured on the server'}.`
          );
        } else {
          lines.push('No email on record, so credentials were not emailed.');
        }
        window.alert(lines.join('\n'));
      }
      setShowModal(false);
      setPhotoPreview(null);
      loadEmployees();
    } catch (err) {
      console.error(err);
      window.alert('Could not save the employee. Please try again.');
    }
  };

  const handleSendResetOtp = async () => {
    const identifier = form.employee_id?.trim();
    if (!identifier) {
      window.alert('This employee has no ID to send a reset code for.');
      return;
    }
    try {
      const res = await sendPasswordResetOtp(identifier);
      window.alert(res.data?.message || `Reset code sent for ${identifier}.`);
    } catch (err) {
      window.alert(err?.response?.data?.error || 'Could not send the reset code.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await deleteEmployee(id);
        loadEmployees();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const statusBadge = (status) => {
    const cls = status === 'Active' ? 'active' : status === 'On Leave' ? 'leave' : 'inactive';
    return <span className={`badge badge-${cls}`}>{status}</span>;
  };

  const modeBadge = (mode) => {
    if (!mode) return <span className="text-muted">-</span>;
    const cls = mode === 'Remote' ? 'remote' : mode === 'Hybrid' ? 'hybrid' : 'onsite';
    return <span className={`badge badge-${cls}`}>{mode}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Employees</h2>
          <p>{employees.length} employee(s) found</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>
            <HiOutlinePlus size={16} /> Add Employee
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ width: 300 }}>
          <input
            type="text"
            placeholder="Search employees..."
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
                <th style={{ width: 44 }}></th>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Mode</th>
                <th>Current Project</th>
                <th>GitHub</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty-state">No employees found.</td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp._id}>
                    <td>
                      <div className="avatar-sm">
                        {!imgErrors[emp._id] && profilePhotoUrl(emp.photo_path) ? (
                          <img src={profilePhotoUrl(emp.photo_path)} alt="" className="avatar-img" onError={() => setImgErrors(prev => ({ ...prev, [emp._id]: true }))} />
                        ) : (
                          <span className="avatar-text">{emp.name?.charAt(0)?.toUpperCase() || '?'}</span>
                        )}
                      </div>
                    </td>
                    <td>{emp.employee_id}</td>
                    <td><strong>{emp.name}</strong></td>
                    <td>{emp.department}</td>
                    <td>{emp.designation}</td>
                    <td>{emp.phone}</td>
                    <td>{emp.email}</td>
                    <td>{modeBadge(emp.work_mode)}</td>
                    <td>{emp.current_project || <span className="text-muted">-</span>}</td>
                    <td>
                      {emp.github ? (
                        <a href={emp.github} target="_blank" rel="noreferrer" className="table-link">GitHub</a>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>{statusBadge(emp.status)}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-icon btn-sm" onClick={() => openEdit(emp)}>
                          <HiOutlinePencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(emp._id)}>
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
              <h3>{editing ? 'Edit Employee' : 'Add Employee'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Employee ID *</label>
                  <input
                    value={form.employee_id}
                    onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                    placeholder="Auto-generated (e.g. PSM002)"
                  />
                  <small className="form-hint">Auto-generated in sequence. You can override it if needed.</small>
                </div>
                {!editing && (
                  <div className="form-group">
                    <label>App Password</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to auto-generate" />
                  </div>
                )}
                <div className="form-group">
                  <label>Profile Photo</label>
                  <div className="photo-upload">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} hidden />
                    <div className="photo-upload-preview" onClick={() => fileInputRef.current?.click()}>
                      {photoPreview && !photoError ? (
                        <img src={photoPreview} alt="Profile" className="photo-upload-img" onError={() => setPhotoError(true)} />
                      ) : (
                        <div className="photo-upload-placeholder"><HiOutlineCamera size={24} /></div>
                      )}
                    </div>
                    <div className="photo-upload-info">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
                        {uploadingPhoto ? 'Uploading...' : 'Choose Photo'}
                      </button>
                      <span className="photo-upload-hint">JPG, PNG, GIF</span>
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select value={form.department} onChange={(e) => handleDepartmentChange(e.target.value)}>
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Designation</label>
                  <select
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    disabled={!form.department}
                  >
                    <option value="">
                      {form.department ? 'Select Designation' : 'Select Department first'}
                    </option>
                    {designationOptions.map((title) => (
                      <option key={title} value={title}>{title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Joining Date</label>
                  <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Mode</label>
                  <select value={form.work_mode} onChange={(e) => setForm({ ...form, work_mode: e.target.value })}>
                    <option value="">Select Mode</option>
                    {WORK_MODES.map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Current Project</label>
                  <input
                    value={form.current_project}
                    onChange={(e) => setForm({ ...form, current_project: e.target.value })}
                    placeholder="e.g. school management system"
                  />
                </div>
                <div className="form-group">
                  <label>GitHub Link</label>
                  <input
                    value={form.github}
                    onChange={(e) => setForm({ ...form, github: e.target.value })}
                    placeholder="https://github.com/username"
                  />
                </div>
                <div className="form-group full-width">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              {editing && (
                <button className="btn btn-secondary" style={{ marginRight: 'auto' }} onClick={handleSendResetOtp}>
                  Email reset code
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editing ? 'Update' : 'Add'} Employee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
