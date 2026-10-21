import { useState, useEffect } from 'react';
import { getSettings, updateSettings, createBackup, listBackups, downloadBackupUrl, restoreBackup } from '../services/services';
import { HiOutlineSave, HiOutlineRefresh, HiOutlineDownload, HiOutlineUpload, HiOutlineTrash } from 'react-icons/hi';

export default function Settings() {
  const [settings, setSettings] = useState({
    office_start: '',
    office_end: '',
    office_latitude: '',
    office_longitude: '',
    allowed_radius_km: '5.0',
    mission: '',
    vision: '',
  });
  const [saved, setSaved] = useState(false);
  const [backups, setBackups] = useState([]);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupMsg, setBackupMsg] = useState(null);

  useEffect(() => {
    loadSettings();
    loadBackups();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await getSettings();
      setSettings(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadBackups = async () => {
    try {
      const res = await listBackups();
      setBackups(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    try {
      await updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    setBackupMsg(null);
    try {
      const res = await createBackup();
      setBackupMsg({ type: 'success', text: `Backup created: ${res.data.filename} (${res.data.size_kb} KB)` });
      loadBackups();
    } catch (err) {
      setBackupMsg({ type: 'error', text: 'Failed to create backup' });
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Restore will replace all current data. Are you sure?')) {
      e.target.value = '';
      return;
    }
    setRestoring(true);
    setBackupMsg(null);
    try {
      const res = await restoreBackup(file);
      setBackupMsg({ type: 'success', text: res.data.message });
      loadBackups();
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.response?.data?.error || 'Restore failed' });
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Settings</h2>
          <p>Configure company and application settings</p>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={handleSave}>
            <HiOutlineSave size={16} /> Save Settings
          </button>
          {saved && <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 13 }}>Saved!</span>}
        </div>
      </div>

      <div className="grid-2">
        <div className="section-card">
          <h3>Backup & Restore</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Create and download full database backups including all records and uploads.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={handleCreateBackup} disabled={creating}>
              <HiOutlineRefresh size={14} /> {creating ? 'Creating...' : 'Create Backup Now'}
            </button>
            <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <HiOutlineUpload size={14} /> Restore from File
              <input type="file" accept=".zip" onChange={handleRestoreBackup} disabled={restoring} style={{ display: 'none' }} />
            </label>
          </div>

          {backupMsg && (
            <p style={{ fontSize: 12, marginBottom: 12, color: backupMsg.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
              {backupMsg.text}
            </p>
          )}

          {restoring && <p style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>Restoring backup, please wait...</p>}

          {backups.length > 0 ? (
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {backups.map((b) => (
                <div key={b.filename} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{b.filename}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{formatDate(b.created_at)} &middot; {b.size_kb} KB</div>
                  </div>
                  <a href={downloadBackupUrl(b.filename)} className="btn btn-sm" style={{ textDecoration: 'none' }} download>
                    <HiOutlineDownload size={14} /> Download
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No backups yet.</p>
          )}
        </div>

        <div className="section-card">
          <h3>Office Timing</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Office Start Time</label>
              <input
                type="time"
                value={settings.office_start || ''}
                onChange={(e) => setSettings({ ...settings, office_start: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Office End Time</label>
              <input
                type="time"
                value={settings.office_end || ''}
                onChange={(e) => setSettings({ ...settings, office_end: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 20 }}></div>

      <div className="section-card">
        <h3>Company Mission &amp; Vision</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          Share the company mission and vision. Both are visible to every user in the mobile app.
        </p>
        <div className="form-group">
          <label>Mission</label>
          <textarea
            rows={4}
            value={settings.mission || ''}
            onChange={(e) => setSettings({ ...settings, mission: e.target.value })}
            placeholder="Why the company exists and what it strives to do every day."
          />
        </div>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label>Vision</label>
          <textarea
            rows={4}
            value={settings.vision || ''}
            onChange={(e) => setSettings({ ...settings, vision: e.target.value })}
            placeholder="The long-term future the company is working towards."
          />
        </div>
      </div>

      <div style={{ height: 20 }}></div>

      <div className="grid-2">
        <div className="section-card">
          <h3>Office Location (for Geotag Verification)</h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Set the office GPS coordinates to validate employee geotag attendance photos.
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label>Office Latitude</label>
              <input
                type="number"
                step="any"
                value={settings.office_latitude || ''}
                onChange={(e) => setSettings({ ...settings, office_latitude: e.target.value })}
                placeholder="e.g. 12.9716"
              />
            </div>
            <div className="form-group">
              <label>Office Longitude</label>
              <input
                type="number"
                step="any"
                value={settings.office_longitude || ''}
                onChange={(e) => setSettings({ ...settings, office_longitude: e.target.value })}
                placeholder="e.g. 77.5946"
              />
            </div>
            <div className="form-group">
              <label>Allowed Radius (km)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={settings.allowed_radius_km || '5.0'}
                onChange={(e) => setSettings({ ...settings, allowed_radius_km: e.target.value })}
                placeholder="5.0"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
