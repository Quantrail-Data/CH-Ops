// App Data Backup - backs up the CHOps SQLite database to S3-compatible storage.
// Uses the same storage profiles configured in Administration > Storage Profiles.
// Supports manual backup, scheduled auto-backup, and lists existing backups.

import React, { useEffect, useState } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch } from '../../utils/api.js';
import { useToast } from '../layout/Toast.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function AppDataBackup() {
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backing, setBacking] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
 
  // Schedule config
  const [config, setConfig] = useState({ enabled: false, profileName: '', frequency: 'daily', backupHour: 2, weekday: 0 });
  const [savingConfig, setSavingConfig] = useState(false);

  async function loadProfiles() {
    try {
      const r = await apiFetch('/api/settings/backup_profiles');
      const parsed = JSON.parse(r?.value || '[]');
      setProfiles(parsed);
      if (parsed.length && !selectedProfile) setSelectedProfile(parsed[0].name);
    } catch { setProfiles([]); }
  }

  async function loadConfig() {
    try { const c = await apiFetch('/api/app-backup/config'); setConfig(c); } catch (e) { toast.error('Failed to load backup config: ' + e.message); }
  }

  async function loadBackups(profile) {
    if (!profile) return;
    setLoadingBackups(true);
    try {
      const list = await apiFetch(`/api/app-backup/list?profile=${encodeURIComponent(profile)}`);
      setBackups(Array.isArray(list) ? list : []);
    } catch { setBackups([]); }
    setLoadingBackups(false);
  }

  useEffect(() => { loadProfiles(); loadConfig(); }, []);
  useEffect(() => { if (selectedProfile) loadBackups(selectedProfile); }, [selectedProfile]);

  async function runBackup() {
    if (!selectedProfile) { toast.warning('Select a storage profile first.'); return; }
    setBacking(true);
    try {
      const manifest = await apiFetch('/api/app-backup/create', { method: 'POST', body: JSON.stringify({ profileName: selectedProfile }) });
      toast.success(`Backup complete: ${manifest.file_size_display}`);
      loadBackups(selectedProfile);
    } catch (err) { toast.error(err.message); }
    setBacking(false);
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      await apiFetch('/api/app-backup/config', { method: 'PUT', body: JSON.stringify(config) });
      toast.success('Schedule saved.');
    } catch (err) { toast.error(err.message); }
    setSavingConfig(false);
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title"><Icon className="ti ti-database-export"></Icon> App Data Backup</h2>
      </div>

      {profiles.length === 0 ? (
        <div className="alert-banner info" style={{ marginBottom: 20 }}>
          <Icon className="ti ti-info-circle"></Icon>
          <span>No storage profiles configured. Go to <strong>Administration &gt; Storage Profiles</strong> to add one.</span>
        </div>
      ) : (
        <>
          {/* Manual Backup */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon className="ti ti-upload" style={{ color: 'var(--accent)' }}></Icon> Manual Backup
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 14 }}>
              Creates a WAL-safe snapshot of the CHOps database and uploads it to S3. Safe to run while the app is running.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div className="form-group">
                <label className="form-label">Storage Profile</label>
                <Select className="form-select" value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)} style={{ minWidth: 200 }}>
                  {profiles.map(p => <option key={p.name} value={p.name}>{p.name} ({p.type.toUpperCase()})</option>)}
                </Select>
              </div>
              <button className="btn btn-primary" onClick={runBackup} disabled={backing || !selectedProfile}>
                <Icon className={`ti ${backing ? 'ti-loader' : 'ti-cloud-upload'}`}></Icon> {backing ? 'Uploading...' : 'Backup Now'}
              </button>
            </div>
          </div>

          {/* Scheduled Backup */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon className="ti ti-clock" style={{ color: 'var(--accent)' }}></Icon> Scheduled Backup
            </h3>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group">
                <label className="form-label">Storage Profile</label>
                <Select className="form-select" value={config.profileName} onChange={e => setConfig(c => ({ ...c, profileName: e.target.value }))} style={{ minWidth: 200 }}>
                  <option value="">-- Select --</option>
                  {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </Select>
              </div>
              <div className="form-group">
                <label className="form-label">Frequency</label>
                <Select className="form-select" value={config.frequency} onChange={e => setConfig(c => ({ ...c, frequency: e.target.value }))}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </Select>
              </div>
              {config.frequency === 'weekly' && (
                <div className="form-group">
                  <label className="form-label">Day</label>
                  <Select className="form-select" value={config.weekday} onChange={e => setConfig(c => ({ ...c, weekday: parseInt(e.target.value) }))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </Select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Hour (24h)</label>
                <Select className="form-select" value={config.backupHour} onChange={e => setConfig(c => ({ ...c, backupHour: parseInt(e.target.value) }))}>
                  {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </Select>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
                  Enabled
                </label>
              </div>
              <button className="btn btn-primary" onClick={saveConfig} disabled={savingConfig}>
                <Icon className="ti ti-device-floppy"></Icon> Save Schedule
              </button>
            </div>
            {config.lastRunAt && (
              <div style={{ marginTop: 12, fontSize: '13px', color: 'var(--text-muted)' }}>
                Last run: <span style={{ color: config.lastRunStatus === 'ok' ? 'var(--color-success)' : 'var(--color-danger)' }}>{config.lastRunStatus}</span>
                {' '}at {new Date(config.lastRunAt).toLocaleString()}
                {config.lastRunError && <span style={{ color: 'var(--color-danger)' }}> - {config.lastRunError}</span>}
              </div>
            )}
          </div>

          {/* Backup History */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon className="ti ti-history" style={{ color: 'var(--accent)' }}></Icon> Backup History
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => loadBackups(selectedProfile)} disabled={loadingBackups}>
                <Icon className="ti ti-refresh"></Icon>
              </button>
            </div>
            {loadingBackups ? (
              <div className="empty-state" style={{ padding: 24 }}><div className="loading-spinner"></div> Loading...</div>
            ) : backups.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}><Icon className="ti ti-database"></Icon><p>No backups found for this profile.</p></div>
            ) : (
              <div className="data-table-wrap dt-fixed" style={{ maxHeight: 480 }}>
                <table className="data-table">
                  <thead><tr>
                    <th>Backup ID</th>
                    <th>Backup Type</th>
                    <th>Date</th>
                    <th>Size</th>
                    <th>Version</th>
                    <th>Tables</th>
                  </tr></thead>
                  <tbody>
                    {backups.map(b => (
                      <tr key={b.backup_id}>
                        <td style={{ fontFamily: 'var(--font-code)', fontSize: '13px' }}>{b.backup_id}</td>
                        <td>{b.backup_type?.toUpperCase() ?? ''}</td>
                        <td>{new Date(b.created_at).toLocaleString()}</td>
                        <td>{b.file_size_display}</td>
                        <td>{b.app_version}</td>
                        <td style={{ fontSize: '12px' }}>
                          {b.table_counts && Object.entries(b.table_counts).map(([t, c]) => (
                            <span key={t} className="badge badge-gray" style={{ marginRight: 4, marginBottom: 2 }}>{t}: {c}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Restore Instructions */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon className="ti ti-arrow-back-up" style={{ color: 'var(--accent)' }}></Icon> Restore Instructions
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowRestore(!showRestore)}>
                <Icon className={`ti ${showRestore ? 'ti-chevron-up' : 'ti-chevron-down'}`}></Icon> {showRestore ? 'Hide' : 'Show'}
              </button>
            </div>
            {showRestore && (
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p style={{ marginBottom: 12, color: 'var(--color-warning)', fontWeight: 600 }}>
                  <Icon className="ti ti-alert-triangle" style={{ fontSize: 16, marginRight: 4 }}></Icon>
                  Restoring replaces all app data. The server must be stopped during restore.
                </p>

                <p style={{ fontWeight: 700, marginBottom: 6 }}>1. Download the backup file from S3</p>
                <pre style={{ background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '13px', marginBottom: 16, overflowX: 'auto' }}>
{`# Using AWS CLI (works with any S3-compatible storage)
aws s3 cp s3://YOUR_BUCKET/chops-app-backups/BACKUP_ID.db ./chops-restore.db \\
  --endpoint-url YOUR_ENDPOINT`}
                </pre>

                <p style={{ fontWeight: 700, marginBottom: 6 }}>2. Stop the server</p>
                <pre style={{ background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '13px', marginBottom: 16, overflowX: 'auto' }}>
{`# Dev mode (Ctrl+C to stop, then):
# If using bun run dev, just stop the process

# Production (systemd)
sudo systemctl stop chops

# Production (binary, running in foreground)
# Ctrl+C or kill the process`}
                </pre>

                <p style={{ fontWeight: 700, marginBottom: 6 }}>3. Replace the database</p>
                <pre style={{ background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '13px', marginBottom: 16, overflowX: 'auto' }}>
{`# Remove WAL and SHM files (they contain unflushed data from the old DB)
rm -f data/chops.db-wal data/chops.db-shm

# Decode the base64 text back to a real SQLite binary
base64 -d chops-restore.db > chops_decoded.db

# Replace the database
cp chops_decoded.db data/chops.db`}
                </pre>

                <p style={{ fontWeight: 700, marginBottom: 6 }}>4. Restart the server</p>
                <pre style={{ background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '13px', marginBottom: 16, overflowX: 'auto' }}>
{`# Dev mode
bun run dev

# Production (systemd)
sudo systemctl start chops

# Production (binary)
./chops`}
                </pre>

                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  The backup is a self-contained SQLite file created with VACUUM INTO. It does not depend on WAL or SHM files.
                  All alert rules, channels, dashboards, charts, backup schedules, user accounts, and settings are included.
                  ClickHouse® data is not affected - only CHOps's internal state is restored.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
