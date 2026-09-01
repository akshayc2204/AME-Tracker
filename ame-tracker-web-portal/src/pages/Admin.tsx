import { useEffect, useState } from 'react';
import {
  FolderSync, RefreshCw, Save, FolderOpen, CheckCircle, User, Pencil,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { api } from '../services/api';

type FolderPair = {
  pairKey: string;
  t4vjobFile: string | null;
  xlsxFile: string | null;
  sourceJobId: string | null;
  jobName: string | null;
  status: 'PENDING' | 'SYNCED' | 'SKIPPED' | 'FAILED' | 'INCOMPLETE';
  itemsImported: number;
  unitsImported: number;
  message: string | null;
  lastSyncedAt: string | null;
};

type FolderSyncStatus = {
  enabled: boolean;
  folderPath: string;
  intervalMinutes: number;
  running: boolean;
  lastRun: {
    imported: number;
    skipped: number;
    failed: number;
    incomplete: number;
    finishedAt: string;
  } | null;
  pairs: FolderPair[];
  error?: string;
};

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Every 1 minute' },
  { value: 2, label: 'Every 2 minutes' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 10, label: 'Every 10 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
];

function folderBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'SYNCED') return 'badge-success';
  if (s === 'SKIPPED') return 'badge-partial';
  if (s === 'FAILED') return 'badge-failed';
  if (s === 'INCOMPLETE') return 'badge-loaded';
  return 'badge-pending';
}

function folderStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case 'SYNCED': return 'Synced';
    case 'SKIPPED': return 'Already imported';
    case 'FAILED': return 'Failed';
    case 'INCOMPLETE': return 'Waiting for files';
    case 'PENDING': return 'Waiting';
    default: return status;
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(value?: string | null): string {
  if (!value) return 'Never';
  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) return formatDateTime(value);
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  return formatDateTime(value);
}

function Message({ type, text }: { type: 'error' | 'success'; text: string }) {
  const isError = type === 'error';
  return (
    <div className={`admin-msg ${isError ? 'is-error' : 'is-success'}`}>
      {isError ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
      {text}
    </div>
  );
}

function FileChip({ present, label }: { present: boolean; label: string }) {
  return (
    <span className={`admin-file-chip ${present ? 'is-ready' : 'is-missing'}`}>
      {present ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
      {label}
    </span>
  );
}

export default function Admin() {
  const { currentUser, setCurrentUser } = useApp();
  const [email, setEmail] = useState(currentUser.email || '');
  const [fullName, setFullName] = useState(currentUser.name || '');
  const [newPassword, setNewPassword] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [folderStatus, setFolderStatus] = useState<FolderSyncStatus | null>(null);
  const [folderPath, setFolderPath] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [folderMsg, setFolderMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  function applyUser(user: { fullName?: string; email?: string }) {
    const name = (user.fullName || '').trim() || fullName.trim();
    setFullName(name);
    if (user.email) setEmail(user.email);
    setCurrentUser((prev) => ({
      ...prev,
      name,
      email: user.email || prev.email,
      avatar: name.slice(0, 2).toUpperCase() || prev.avatar,
    }));
  }

  async function load() {
    setLoading(true);
    try {
      const [me, status] = await Promise.all([
        api.getMe().catch(() => null),
        api.getFolderSyncStatus().catch(() => null),
      ]);
      if (me) applyUser(me);
      if (status) {
        setFolderStatus(status);
        setFolderPath(status.folderPath || '');
        setIntervalMinutes(status.intervalMinutes || 5);
      }
    } catch (err: unknown) {
      setFolderMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load admin settings',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profileMsg?.type !== 'success') return;
    const t = window.setTimeout(() => setProfileMsg(null), 4000);
    return () => window.clearTimeout(t);
  }, [profileMsg]);

  useEffect(() => {
    if (folderMsg?.type !== 'success') return;
    const t = window.setTimeout(() => setFolderMsg(null), 4000);
    return () => window.clearTimeout(t);
  }, [folderMsg]);

  function startEditProfile() {
    setFullName(currentUser.name || fullName);
    setNewPassword('');
    setProfileMsg(null);
    setEditingProfile(true);
  }

  function cancelEditProfile() {
    setFullName(currentUser.name || fullName);
    setNewPassword('');
    setProfileMsg(null);
    setEditingProfile(false);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const name = fullName.trim();
    if (name.length < 2) {
      setProfileMsg({ type: 'error', text: 'Name must be at least 2 characters.' });
      return;
    }
    const password = newPassword.trim();
    if (password && password.length < 6) {
      setProfileMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setSavingProfile(true);
    try {
      const me = await api.updateProfile({
        fullName: name,
        ...(password ? { newPassword: password } : {}),
      });
      applyUser(me);
      setNewPassword('');
      setEditingProfile(false);
      setProfileMsg({
        type: 'success',
        text: password ? 'Name and password updated.' : 'Profile updated.',
      });
    } catch (err: unknown) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save profile' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveFolder(e: React.FormEvent) {
    e.preventDefault();
    setFolderMsg(null);
    const nextPath = folderPath.trim();
    if (!nextPath) {
      setFolderMsg({ type: 'error', text: 'Enter the folder path where job files are dropped.' });
      return;
    }
    if (!nextPath.startsWith('/')) {
      setFolderMsg({ type: 'error', text: 'Use a full path, for example /Users/you/DataUploads' });
      return;
    }
    setSavingFolder(true);
    try {
      const status = await api.updateFolderSyncSettings({
        folderPath: nextPath,
        intervalMinutes,
      });
      setFolderStatus(status);
      setFolderPath(status.folderPath);
      setIntervalMinutes(status.intervalMinutes);
      setFolderMsg({
        type: 'success',
        text: `Folder saved. New jobs will be checked ${intervalLabel(status.intervalMinutes).toLowerCase()}.`,
      });
    } catch (err: unknown) {
      setFolderMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save folder path' });
    } finally {
      setSavingFolder(false);
    }
  }

  async function handleSyncNow() {
    setFolderMsg(null);
    setSyncing(true);
    try {
      await api.runFolderSync();
      const status = await api.getFolderSyncStatus();
      setFolderStatus(status);
      setFolderMsg({ type: 'success', text: 'Sync finished. Job list is up to date.' });
    } catch (err: unknown) {
      setFolderMsg({ type: 'error', text: err instanceof Error ? err.message : 'Folder sync failed' });
    } finally {
      setSyncing(false);
    }
  }

  function intervalLabel(mins: number): string {
    return INTERVAL_OPTIONS.find((o) => o.value === mins)?.label || `Every ${mins} minutes`;
  }

  const lastRun = folderStatus?.lastRun;
  const pairs = folderStatus?.pairs ?? [];
  const syncOn = folderStatus?.enabled !== false;
  const initials = (fullName || currentUser.avatar || 'A').slice(0, 2).toUpperCase();

  return (
    <div className="admin-page">
      <div className="page-header">
        <h2>Admin</h2>
        <p>Update your account and manage how jobs are imported from the folder.</p>
      </div>

      <div className="card admin-profile-card">
        <div className="card-header">
          <div>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={16} color="var(--green-600)" />
              Your account
            </div>
            <div className="card-subtitle">Name and password used to sign in to AME Tracker.</div>
          </div>
          {!editingProfile && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={startEditProfile}>
              <Pencil size={14} />
              Edit profile
            </button>
          )}
        </div>

        {editingProfile ? (
          <form className="card-body" onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="admin-form-grid">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  className="form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  disabled={savingProfile}
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" value={email} disabled readOnly />
                <div className="form-hint">Email cannot be changed.</div>
              </div>
              <div className="form-group admin-form-grid-span">
                <label className="form-label">New password</label>
                <input
                  className="form-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep the current password"
                  disabled={savingProfile}
                  autoComplete="new-password"
                />
                <div className="form-hint">Optional. At least 6 characters if you set a new one.</div>
              </div>
            </div>
            {profileMsg && <Message type={profileMsg.type} text={profileMsg.text} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" type="button" onClick={cancelEditProfile} disabled={savingProfile}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={savingProfile}>
                {savingProfile ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {savingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="card-body">
            <div className="admin-profile-view">
              <div className="user-avatar admin-profile-avatar">{initials}</div>
              <div className="admin-profile-fields">
                <div>
                  <div className="form-label" style={{ color: 'var(--text-muted)' }}>Name</div>
                  <div className="admin-profile-value">{fullName || '—'}</div>
                </div>
                <div>
                  <div className="form-label" style={{ color: 'var(--text-muted)' }}>Email</div>
                  <div className="admin-profile-value">{email || '—'}</div>
                </div>
                <div>
                  <div className="form-label" style={{ color: 'var(--text-muted)' }}>Password</div>
                  <div className="admin-profile-value" style={{ letterSpacing: 2 }}>••••••••</div>
                </div>
              </div>
            </div>
            {profileMsg && <div style={{ marginTop: 16 }}><Message type={profileMsg.type} text={profileMsg.text} /></div>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderSync size={16} color="var(--green-600)" />
              Job folder sync
            </div>
            <div className="card-subtitle">
              Matching <code>.t4vjob</code> and <code>.xlsx</code> files in this folder become projects automatically.
            </div>
          </div>
          <div className="admin-sync-actions">
            <span className={`badge ${syncOn ? 'badge-success' : 'badge-failed'}`}>
              {syncOn ? 'Auto-sync on' : 'Auto-sync off'}
            </span>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void handleSyncNow()}
              disabled={syncing || savingFolder || !syncOn}
            >
              {syncing ? <RefreshCw size={14} className="animate-spin" /> : <FolderSync size={14} />}
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>

        <form className="card-body" onSubmit={handleSaveFolder} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="admin-sync-stats">
            <div className="admin-sync-stat">
              <span>Last check</span>
              <strong>{syncing || folderStatus?.running ? 'Running…' : formatRelative(lastRun?.finishedAt)}</strong>
            </div>
            <div className="admin-sync-stat">
              <span>Imported</span>
              <strong>{lastRun?.imported ?? 0}</strong>
            </div>
            <div className="admin-sync-stat">
              <span>Already there</span>
              <strong>{lastRun?.skipped ?? 0}</strong>
            </div>
            <div className="admin-sync-stat is-warn">
              <span>Waiting for files</span>
              <strong>{lastRun?.incomplete ?? 0}</strong>
            </div>
            <div className="admin-sync-stat is-error">
              <span>Failed</span>
              <strong>{lastRun?.failed ?? 0}</strong>
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="form-group admin-form-grid-span">
              <label className="form-label">Watch folder</label>
              <div style={{ position: 'relative' }}>
                <FolderOpen size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-input"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="/Users/you/DataUploads"
                  style={{ paddingLeft: 36, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
                  disabled={savingFolder}
                  autoComplete="off"
                />
              </div>
              <div className="form-hint">
                Full path on this computer. The folder is created if it does not exist.
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">How often to check</label>
              <select
                className="form-select"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 5))}
                disabled={savingFolder}
              >
                {!INTERVAL_OPTIONS.some((o) => o.value === intervalMinutes) && (
                  <option value={intervalMinutes}>{intervalLabel(intervalMinutes)}</option>
                )}
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {folderStatus?.error && (
            <Message type="error" text={folderStatus.error} />
          )}
          {folderMsg && <Message type={folderMsg.type} text={folderMsg.text} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" type="submit" disabled={savingFolder || syncing}>
              {savingFolder ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              {savingFolder ? 'Saving…' : 'Save folder settings'}
            </button>
          </div>
        </form>

        <div className="admin-jobs-head">
          <div>
            <div className="card-title">Jobs in this folder</div>
            <div className="card-subtitle">
              {loading && !folderStatus
                ? 'Checking folder…'
                : pairs.length === 1
                  ? '1 job file pair found'
                  : `${pairs.length} job file pairs found`}
            </div>
          </div>
        </div>

        <div className="table-wrapper import-history-table">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Files</th>
                <th>Imported</th>
                <th>Status</th>
                <th>Last checked</th>
              </tr>
            </thead>
            <tbody>
              {loading && !folderStatus ? (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    <RefreshCw size={18} className="animate-spin" />
                    Checking the watch folder…
                  </td>
                </tr>
              ) : pairs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    <FolderOpen size={22} />
                    <div>
                      <strong>No job files yet</strong>
                      <div>Drop a matching .t4vjob and .xlsx into the folder, then tap Sync now.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                pairs.map((pair) => (
                  <tr key={pair.pairKey}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{pair.jobName || pair.pairKey}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {pair.sourceJobId || pair.pairKey}
                      </div>
                    </td>
                    <td>
                      <div className="admin-file-row">
                        <FileChip present={Boolean(pair.t4vjobFile)} label={pair.t4vjobFile ? 'Job file' : 'No job file'} />
                        <FileChip present={Boolean(pair.xlsxFile)} label={pair.xlsxFile ? 'Excel file' : 'No Excel file'} />
                      </div>
                    </td>
                    <td>
                      {pair.itemsImported || pair.unitsImported
                        ? `${pair.itemsImported} items · ${pair.unitsImported} pieces`
                        : '—'}
                    </td>
                    <td>
                      <span className={`badge ${folderBadgeClass(pair.status)}`}>
                        {folderStatusLabel(pair.status)}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatRelative(pair.lastSyncedAt)}
                      {pair.message ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{pair.message}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
