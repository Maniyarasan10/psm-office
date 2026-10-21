import { useState, useEffect } from 'react';
import {
  getDocuments, uploadDocument, renameDocument, deleteDocument,
  downloadDocumentUrl, getDocumentCategories,
} from '../services/services';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineDownload, HiOutlineFolderOpen } from 'react-icons/hi';

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showRename, setShowRename] = useState(null);
  const [newName, setNewName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('Employee Documents');
  const [uploadLinkedPerson, setUploadLinkedPerson] = useState('');

  useEffect(() => {
    loadDocuments();
    loadCategories();
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

  const handleUpload = async () => {
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('category', uploadCategory);
    formData.append('linked_person', uploadLinkedPerson);
    try {
      await uploadDocument(formData);
      setShowUpload(false);
      setUploadFile(null);
      loadDocuments();
    } catch (err) {
      console.error(err);
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

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Company Files</h2>
          <p>{documents.length} file(s)</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
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

      <div className="card">
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
              {documents.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No files found.</td></tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc._id}>
                    <td><strong>{doc.file_name}</strong></td>
                    <td><span className="badge badge-active">{doc.category}</span></td>
                    <td>{doc.file_type || '-'}</td>
                    <td>{doc.uploaded_by || '-'}</td>
                    <td>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-icon btn-sm" title="Download" onClick={() => handleDownload(doc._id)}>
                          <HiOutlineDownload size={14} />
                        </button>
                        <button className="btn btn-secondary btn-icon btn-sm" title="Rename" onClick={() => { setShowRename(doc._id); setNewName(doc.file_name); }}>
                          <HiOutlinePencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-icon btn-sm" title="Delete" onClick={() => handleDelete(doc._id)}>
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
                  <label>Linked Person</label>
                  <input value={uploadLinkedPerson} onChange={(e) => setUploadLinkedPerson(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload}>Upload</button>
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
