import { useState, useEffect, useMemo } from 'react';
import {
  getDocuments, uploadDocument, renameDocument, deleteDocument,
  downloadDocumentUrl, getDocumentCategories, updateDocumentVisibility,
  getEmployees, getInterns,
} from '../services/services';
import {
  HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineDownload,
  HiOutlineUserGroup, HiOutlineShare, HiOutlineLockClosed,
} from 'react-icons/hi';

const personKey = (type, id) => `${type}:${id}`;

const isSharedDocument = (doc) => {
  if (typeof doc.shared === 'boolean') return doc.shared;
  return !doc.linked_person && !(doc.visible_to || []).length;
};

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [interns, setInterns] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showRename, setShowRename] = useState(null);
  const [newName, setNewName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('Employee Documents');
  const [uploadLinkedPerson, setUploadLinkedPerson] = useState('');
  const [uploadShared, setUploadShared] = useState(true);
  const [uploadVisibleTo, setUploadVisibleTo] = useState([]);
  const [visibilityDoc, setVisibilityDoc] = useState(null);
  const [visShared, setVisShared] = useState(true);
  const [visLinkedPerson, setVisLinkedPerson] = useState('');
  const [visVisibleTo, setVisVisibleTo] = useState([]);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadDocuments();
    loadCategories();
    loadPeople();
  }, [search, filterCategory]);

  const loadDocuments = async () => {
    try {
      const res = await getDocuments(search || undefined, filterCategory || undefined);
      setDocuments(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await getDocumentCategories();
      setCategories(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPeople = async () => {
    try {
      const [empRes, intRes] = await Promise.all([getEmployees(), getInterns()]);
      setEmployees(empRes.data || []);
      setInterns(intRes.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const people = useMemo(() => ([
    ...employees.map((e) => ({
      key: personKey('employee', e._id),
      type: 'employee',
      id: e._id,
      name: e.name || 'Unnamed',
      subId: e.employee_id,
    })),
    ...interns.map((i) => ({
      key: personKey('intern', i._id),
      type: 'intern',
      id: i._id,
      name: i.name || 'Unnamed',
      subId: i.intern_id,
    })),
  ]), [employees, interns]);

  const peopleByKey = useMemo(
    () => new Map(people.map((p) => [p.key, p])),
    [people]
  );

  const keyForPersonId = useMemo(() => {
    const map = new Map();
    people.forEach((p) => map.set(String(p.id), p.key));
    return map;
  }, [people]);

  const allocatedDocs = documents.filter((doc) => !isSharedDocument(doc));
  const sharedDocs = documents.filter((doc) => isSharedDocument(doc));

  const recipientLabels = (doc) => {
    const labels = [];
    const linkedKey = doc.linked_person ? keyForPersonId.get(String(doc.linked_person)) : null;
    if (linkedKey && peopleByKey.has(linkedKey)) {
      labels.push(`${peopleByKey.get(linkedKey).name} (owner)`);
    } else if (doc.linked_person) {
      labels.push(String(doc.linked_person));
    }
    (doc.visible_to || []).forEach((key) => {
      const person = peopleByKey.get(key);
      if (person) labels.push(person.name);
    });
    return labels;
  };

  const toggleFromList = (setter, key) => {
    setter((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ));
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadLinkedPerson('');
    setUploadShared(true);
    setUploadVisibleTo([]);
    setFormError('');
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    if (!uploadShared && !uploadLinkedPerson && uploadVisibleTo.length === 0) {
      setFormError('Select at least one person, or share the file with everyone.');
      return;
    }
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('category', uploadCategory);
    formData.append('linked_person', !uploadShared && uploadLinkedPerson ? uploadLinkedPerson.split(':')[1] : '');
    formData.append('shared', String(uploadShared));
    formData.append('visible_to', JSON.stringify(uploadShared ? [] : uploadVisibleTo));
    try {
      await uploadDocument(formData);
      setShowUpload(false);
      resetUploadForm();
      loadDocuments();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to upload the file.');
    }
  };

  const toggleUploadPerson = (key) => {
    toggleFromList(setUploadVisibleTo, key);
  };

  const openVisibility = (doc) => {
    const shared = isSharedDocument(doc);
    setVisibilityDoc(doc);
    setVisShared(shared);
    setVisVisibleTo(doc.visible_to || []);
    const linkedKey = doc.linked_person ? keyForPersonId.get(String(doc.linked_person)) : '';
    setVisLinkedPerson(linkedKey || '');
    setFormError('');
  };

  const handleSaveVisibility = async () => {
    if (!visibilityDoc) return;
    if (!visShared && !visLinkedPerson && visVisibleTo.length === 0) {
      setFormError('Select at least one person, or share the file with everyone.');
      return;
    }
    setSavingVisibility(true);
    try {
      await updateDocumentVisibility(visibilityDoc._id, {
        linked_person: visShared ? '' : (visLinkedPerson ? visLinkedPerson.split(':')[1] : ''),
        shared: visShared,
        visible_to: visShared ? [] : visVisibleTo,
      });
      setVisibilityDoc(null);
      setFormError('');
      loadDocuments();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update visibility.');
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleRename = async () => {
    if (!showRename || !newName) return;
    try {
      await renameDocument(showRename, newName);
      setShowRename(null);
      loadDocuments();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        await deleteDocument(id);
        loadDocuments();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDownload = (id) => {
    window.open(downloadDocumentUrl(id), '_blank', 'noopener');
  };

  const renderPersonPicker = (selected, onToggle) => (
    <div className="member-picker">
      <div className="member-picker-group">Employees</div>
      {employees.length === 0 && <div className="member-picker-empty">No employees.</div>}
      {employees.map((emp) => {
        const key = personKey('employee', emp._id);
        return (
          <label key={key} className="member-option">
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={() => onToggle(key)}
            />
            <span>{emp.name || 'Unnamed'}{emp.employee_id ? ` (${emp.employee_id})` : ''}</span>
          </label>
        );
      })}
      <div className="member-picker-group">Interns</div>
      {interns.length === 0 && <div className="member-picker-empty">No interns.</div>}
      {interns.map((intern) => {
        const key = personKey('intern', intern._id);
        return (
          <label key={key} className="member-option">
            <input
              type="checkbox"
              checked={selected.includes(key)}
              onChange={() => onToggle(key)}
            />
            <span>{intern.name || 'Unnamed'}{intern.intern_id ? ` (${intern.intern_id})` : ''}</span>
          </label>
        );
      })}
    </div>
  );

  const renderActions = (doc) => (
    <div className="table-actions">
      <button className="btn btn-secondary btn-icon btn-sm" title="Download" onClick={() => handleDownload(doc._id)}>
        <HiOutlineDownload size={14} />
      </button>
      <button className="btn btn-secondary btn-icon btn-sm" title="Allocate visibility" onClick={() => openVisibility(doc)}>
        <HiOutlineUserGroup size={14} />
      </button>
      <button className="btn btn-secondary btn-icon btn-sm" title="Rename" onClick={() => { setShowRename(doc._id); setNewName(doc.file_name); }}>
        <HiOutlinePencil size={14} />
      </button>
      <button className="btn btn-danger btn-icon btn-sm" title="Delete" onClick={() => handleDelete(doc._id)}>
        <HiOutlineTrash size={14} />
      </button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Company Files</h2>
          <p>{documents.length} file(s) - {allocatedDocs.length} allocated, {sharedDocs.length} shared</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => { resetUploadForm(); setShowUpload(true); }}>
            <HiOutlinePlus size={16} /> Upload File
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-bar" style={{ width: 300 }}>
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div className="section-card">
        <h3><HiOutlineLockClosed size={16} /> Allocated Files</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Files whose visibility is limited to specific employees or interns.
        </p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Visible To</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allocatedDocs.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No allocated files.</td></tr>
              ) : (
                allocatedDocs.map((doc) => {
                  const labels = recipientLabels(doc);
                  return (
                    <tr key={doc._id}>
                      <td><strong>{doc.file_name}</strong></td>
                      <td><span className="badge badge-active">{doc.category}</span></td>
                      <td>{doc.file_type || '-'}</td>
                      <td>
                        {labels.length === 0 ? (
                          <span className="text-muted">Not allocated</span>
                        ) : (
                          labels.map((label) => (
                            <span key={`${doc._id}-${label}`} className="badge badge-onsite" style={{ marginRight: 4 }}>
                              {label}
                            </span>
                          ))
                        )}
                      </td>
                      <td>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '-'}</td>
                      <td>{renderActions(doc)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-card" style={{ marginTop: 20 }}>
        <h3><HiOutlineShare size={16} /> Shared Files</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Files shared with everyone. These appear in the company files list for all employees and interns.
        </p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Uploaded By</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sharedDocs.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No shared files.</td></tr>
              ) : (
                sharedDocs.map((doc) => (
                  <tr key={doc._id}>
                    <td><strong>{doc.file_name}</strong></td>
                    <td><span className="badge badge-active">{doc.category}</span></td>
                    <td>{doc.file_type || '-'}</td>
                    <td>{doc.uploaded_by || '-'}</td>
                    <td>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '-'}</td>
                    <td>{renderActions(doc)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload File</h3>
              <button className="modal-close" onClick={() => setShowUpload(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>File *</label>
                  <input type="file" onChange={(e) => setUploadFile(e.target.files[0])} />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Shared With Everyone</label>
                  <label className="member-option">
                    <input
                      type="checkbox"
                      checked={uploadShared}
                      onChange={(e) => setUploadShared(e.target.checked)}
                    />
                    <span>Visible to all employees and interns</span>
                  </label>
                </div>
                {!uploadShared && (
                  <>
                    <div className="form-group full-width">
                      <label>Linked Person (owner)</label>
                      <select value={uploadLinkedPerson} onChange={(e) => setUploadLinkedPerson(e.target.value)}>
                        <option value="">No linked person</option>
                        {people.map((person) => (
                          <option key={person.key} value={person.key}>
                            {person.name}{person.subId ? ` (${person.subId})` : ''} - {person.type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group full-width">
                      <label>Visible To - {uploadVisibleTo.length} selected</label>
                      {renderPersonPicker(uploadVisibleTo, toggleUploadPerson)}
                    </div>
                  </>
                )}
              </div>
              {formError && (
                <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{formError}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload}>Upload</button>
            </div>
          </div>
        </div>
      )}

      {visibilityDoc && (
        <div className="modal-overlay" onClick={() => setVisibilityDoc(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Allocate Visibility</h3>
              <button className="modal-close" onClick={() => setVisibilityDoc(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>File</label>
                <input value={visibilityDoc.file_name} readOnly />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Shared With Everyone</label>
                <label className="member-option">
                  <input
                    type="checkbox"
                    checked={visShared}
                    onChange={(e) => setVisShared(e.target.checked)}
                  />
                  <span>Visible to all employees and interns</span>
                </label>
              </div>
              {!visShared && (
                <>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>Linked Person (owner)</label>
                    <select value={visLinkedPerson} onChange={(e) => setVisLinkedPerson(e.target.value)}>
                      <option value="">No linked person</option>
                      {people.map((person) => (
                        <option key={person.key} value={person.key}>
                          {person.name}{person.subId ? ` (${person.subId})` : ''} - {person.type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Visible To - {visVisibleTo.length} selected</label>
                    {renderPersonPicker(visVisibleTo, (key) => toggleFromList(setVisVisibleTo, key))}
                  </div>
                </>
              )}
              {formError && (
                <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{formError}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setVisibilityDoc(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveVisibility} disabled={savingVisibility}>
                {savingVisibility ? 'Saving...' : 'Save Visibility'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRename && (
        <div className="modal-overlay" onClick={() => setShowRename(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rename File</h3>
              <button className="modal-close" onClick={() => setShowRename(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>New Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowRename(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRename}>Rename</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
