import { useState, useEffect, useRef } from 'react';
import {
  getInterns, getNextInternId, createIntern, updateIntern, deleteIntern,
  uploadProfilePhoto, profilePhotoUrl, sendPasswordResetOtp,
  getEmployees,
} from '../services/services';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineCamera } from 'react-icons/hi';
import { addMonths, format } from 'date-fns';
import { DEPARTMENTS, WORK_MODES } from '../constants/options';

const defaultForm = {
  intern_id: '', name: '', college: '', duration: '', email: '',
  department: '', mentor: '', start_date: '', end_date: '',
  remarks: '', photo_path: '', password: '',
  designation: '', work_mode: '', current_project: '', github: '',
};

export default function Interns() {
  const [interns, setInterns] = useState([]);
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

  const [mentors, setMentors] = useState([]);

  const calculateEndDate = (startDate, months) => {
    if (!startDate || !months) return null;
    const num = parseInt(months);
    if (isNaN(num) || num <= 0) return null;
    return format(addMonths(new Date(startDate + 'T00:00:00'), num), 'yyyy-MM-dd');
  };

  useEffect(() => {
    loadInterns();
    loadMentors();
  }, [search]);

  const loadMentors = async () => {
    try {
      const res = await getEmployees();
      setMentors((res.data || []).filter((e) => e.status !== 'Inactive'));
    } catch (err) {
      console.error(err);
    }
  };

  const loadInterns = async () => {
    try {
      const res = await getInterns(search || undefined);
      const sorted = [...(res.data || [])].sort((a, b) =>
        String(a.intern_id || '').localeCompare(String(b.intern_id || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );
      setInterns(sorted);
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
      const res = await getNextInternId();
      const nextId = res.data?.next_id;
      if (nextId) {
        setForm((prev) => (prev.intern_id ? prev : { ...prev, intern_id: nextId }));
      }
    } catch {
      // Leave blank; the server assigns an ID on save if it's still empty.
    }
  };

  const openEdit = (intern) => {
    const parsed = { ...defaultForm, ...intern, password: '' };
    if (typeof parsed.duration === 'string' && isNaN(parseInt(parsed.duration))) {
      const m = parsed.duration.match(/(\d+)/);
      if (m) parsed.duration = m[1];
    }
    if (intern.mentor_id) parsed.mentor_id = intern.mentor_id;
    if (intern.mentor) parsed.mentor = intern.mentor;
    latestPhotoPathRef.current = intern.photo_path || '';
    setForm(parsed);
    setPhotoPreview(profilePhotoUrl(intern.photo_path));
    setPhotoError(false);
    setEditing(intern._id);
    setShowModal(true);
  };

  const handleSave = async () => {
    const selectedPhoto = latestPhotoPathRef.current || form.photo_path || '';

    if (uploadingPhoto && !selectedPhoto) {
      window.alert('Please wait for the photo upload to finish before saving.');
      return;
    }

    try {
      const { _id, created_at, updated_at, mentor_name, mentor_email, mentor_phone, mentor_department, mentor_designation, progress, ...cleanForm } = form;
      const payload = { ...cleanForm, photo_path: selectedPhoto };
      if (editing) {
        await updateIntern(editing, payload);
      } else {
        const res = await createIntern(payload);
        const info = res.data || {};
        const lines = [`Intern ${info.intern_id} added.`];
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
      loadInterns();
    } catch (err) {
      console.error(err);
      window.alert('Could not save the intern. Please try again.');
    }
  };

  const handleSendResetOtp = async () => {
    const identifier = form.intern_id?.trim();
    if (!identifier) {
      window.alert('This intern has no ID to send a reset code for.');
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
    if (window.confirm('Are you sure you want to delete this intern?')) {
      try {
        await deleteIntern(id);
        loadInterns();
      } catch (err) {
        console.error(err);
      }
    }
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
          <h2>Interns</h2>
          <p>{interns.length} intern(s) found</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={openAdd}>
            <HiOutlinePlus size={16} /> Add Intern
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ width: 300 }}>
          <input
            type="text"
            placeholder="Search interns..."
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
                <th>Intern ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>College</th>
                <th>Department</th>
                <th>Mentor</th>
                <th>Mode</th>
                <th>Current Project</th>
                <th>GitHub</th>
                <th>Duration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {interns.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="empty-state">No interns found.</td>
                  </tr>
                ) : (
                  interns.map((intern) => (
                    <tr key={intern._id}>
                      <td>
                        <div className="avatar-sm">
                          {!imgErrors[intern._id] && profilePhotoUrl(intern.photo_path) ? (
                            <img src={profilePhotoUrl(intern.photo_path)} alt="" className="avatar-img" onError={() => setImgErrors(prev => ({ ...prev, [intern._id]: true }))} />
                          ) : (
                            <span className="avatar-text">{intern.name?.charAt(0)?.toUpperCase() || '?'}</span>
                          )}
                        </div>
                      </td>
                      <td>{intern.intern_id}</td>
                      <td><strong>{intern.name}</strong></td>
                      <td>{intern.designation || <span className="text-muted">-</span>}</td>
                      <td>{intern.college}</td>
                      <td>{intern.department}</td>
                      <td>{intern.mentor_name || intern.mentor || '-'}</td>
                      <td>{modeBadge(intern.work_mode)}</td>
                      <td>{intern.current_project || <span className="text-muted">-</span>}</td>
                      <td>
                        {intern.github ? (
                          <a href={intern.github} target="_blank" rel="noreferrer" className="table-link">GitHub</a>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td>{intern.duration}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-icon btn-sm" onClick={() => openEdit(intern)}>
                          <HiOutlinePencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(intern._id)}>
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
              <h3>{editing ? 'Edit Intern' : 'Add Intern'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Intern ID *</label>
                  <input
                    value={form.intern_id}
                    onChange={(e) => setForm({ ...form, intern_id: e.target.value })}
                    placeholder="Auto-generated (e.g. PSM-I001)"
                  />
                  <small className="form-hint">Auto-generated in sequence. You can override it if needed.</small>
                </div>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="For login credentials" />
                </div>
                <div className="form-group">
                  <label>College</label>
                  <input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Duration (months)</label>
                  <input type="number" min="1" value={form.duration} onChange={(e) => {
                    const val = e.target.value;
                    const updates = { ...form, duration: val };
                    const end = calculateEndDate(form.start_date, val);
                    if (end) updates.end_date = end;
                    setForm(updates);
                  }} placeholder="e.g. 3" />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <input
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    placeholder="e.g. Gen AI & LLM Engineer"
                  />
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
                    placeholder="e.g. psm intern"
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
                <div className="form-group">
                  <label>Mentor</label>
                  <select
                    value={form.mentor_id || ''}
                    onChange={(e) => {
                      const mentorId = e.target.value;
                      const mentor = mentors.find((m) => m._id === mentorId || m.employee_id === mentorId);
                      setForm({ ...form, mentor_id: mentorId, mentor: mentor?.name || mentorId || '' });
                    }}>
                    <option value="">Select Mentor</option>
                    {mentors.map((m) => (
                      <option key={m._id} value={m.employee_id || m._id}>
                        {m.name} {m.employee_id ? `(${m.employee_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.start_date} onChange={(e) => {
                    const val = e.target.value;
                    const updates = { ...form, start_date: val };
                    const end = calculateEndDate(val, form.duration);
                    if (end) updates.end_date = end;
                    setForm(updates);
                  }} />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to auto-generate" />
                </div>
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
                <div className="form-group full-width">
                  <label>Remarks</label>
                  <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
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
                {editing ? 'Update' : 'Add'} Intern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
