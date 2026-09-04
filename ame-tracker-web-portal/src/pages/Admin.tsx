import { useEffect, useState } from 'react';
import {
  FolderSync, RefreshCw, Save, FolderOpen, CheckCircle, User, Pencil,
  AlertCircle, Archive, Smartphone, Plus, X, ChevronDown,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { api } from '../services/api';
import {
  FOLDER_PATH_HINT,
  FOLDER_PATH_PLACEHOLDER,
  isAbsoluteFolderPath,
} from '../utils/pathUtils';

type PortalUser = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  isActive: number;
  createdAt?: string;
};

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
  const [archivedJobs, setArchivedJobs] = useState<Array<{
    id: number;
    jobName: string;
    projectName: string;
    sourceJobId: string;
    importVersion: number;
    totalParts: number;
    archivedByName?: string;
    archivedAt: string;
  }>>([]);
  const [archivesLoading, setArchivesLoading] = useState(true);
  const [folderJobsOpen, setFolderJobsOpen] = useState(false);
  const [archivedJobsOpen, setArchivedJobsOpen] = useState(false);
  const [operators, setOperators] = useState<PortalUser[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(true);
  const [operatorMsg, setOperatorMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [editingOperatorId, setEditingOperatorId] = useState<number | null>(null);
  const [creatingOperator, setCreatingOperator] = useState(false);
  const [savingOperator, setSavingOperator] = useState(false);
  const [opName, setOpName] = useState('');
  const [opEmail, setOpEmail] = useState('');
  const [opPassword, setOpPassword] = useState('');

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

  async function loadOperators() {
    setOperatorsLoading(true);
    try {
      const users = await api.listUsers();
      const list = Array.isArray(users) ? users : [];
      setOperators(
        list
          .filter((u) => String(u.role || '').toUpperCase() === 'OPERATOR')
          .map((u) => ({
            id: u.id,
            email: u.email,
            fullName: u.fullName || u.name || '',
            role: u.role,
            isActive: u.isActive,
            createdAt: u.createdAt,
          })),
      );
    } catch (err: unknown) {
      setOperatorMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load operators',
      });
    } finally {
      setOperatorsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setArchivesLoading(true);
    try {
      const [me, status, archives] = await Promise.all([
        api.getMe().catch(() => null),
        api.getFolderSyncStatus().catch(() => null),
        api.getJobArchives().catch(() => []),
        loadOperators(),
      ]);
      if (me) applyUser(me);
      if (status) {
        setFolderStatus(status);
        setFolderPath(status.folderPath || '');
        setIntervalMinutes(status.intervalMinutes || 5);
      }
      if (Array.isArray(archives)) setArchivedJobs(archives);
    } catch (err: unknown) {
      setFolderMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load admin settings',
      });
    } finally {
      setLoading(false);
      setArchivesLoading(false);
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

  useEffect(() => {
    if (operatorMsg?.type !== 'success') return;
    const t = window.setTimeout(() => setOperatorMsg(null), 4000);
    return () => window.clearTimeout(t);
  }, [operatorMsg]);

  function resetOperatorForm() {
    setOpName('');
    setOpEmail('');
    setOpPassword('');
    setEditingOperatorId(null);
    setCreatingOperator(false);
  }

  function startCreateOperator() {
    setOperatorMsg(null);
    setEditingOperatorId(null);
    setCreatingOperator(true);
    setOpName('');
    setOpEmail('');
    setOpPassword('');
  }

  function startEditOperator(op: PortalUser) {
    setOperatorMsg(null);
    setCreatingOperator(false);
    setEditingOperatorId(op.id);
    setOpName(op.fullName || '');
    setOpEmail(op.email || '');
    setOpPassword('');
  }

  async function handleSaveOperator(e: React.FormEvent) {
    e.preventDefault();
    setOperatorMsg(null);
    const name = opName.trim();
    const nextEmail = opEmail.trim().toLowerCase();
    const password = opPassword.trim();

    if (name.length < 2) {
      setOperatorMsg({ type: 'error', text: 'Operator name must be at least 2 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setOperatorMsg({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (creatingOperator && password.length < 6) {
      setOperatorMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (!creatingOperator && password && password.length < 6) {
      setOperatorMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setSavingOperator(true);
    try {
      if (creatingOperator) {
        await api.createUser({
          email: nextEmail,
          password,
          fullName: name,
          role: 'OPERATOR',
        });
        setOperatorMsg({ type: 'success', text: 'Mobile operator created.' });
      } else if (editingOperatorId != null) {
        await api.updateUser(editingOperatorId, {
          fullName: name,
          email: nextEmail,
          ...(password ? { newPassword: password } : {}),
        });
        setOperatorMsg({
          type: 'success',
          text: password ? 'Operator name and password updated.' : 'Operator updated.',
        });
      }
      resetOperatorForm();
      await loadOperators();
    } catch (err: unknown) {
      setOperatorMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not save operator',
      });
    } finally {
      setSavingOperator(false);
    }
  }

  function startEditProfile() {
    setFullName(currentUser.name || fullName);
    setEmail(currentUser.email || email);
    setNewPassword('');
    setProfileMsg(null);
    setEditingProfile(true);
  }

  function cancelEditProfile() {
    setFullName(currentUser.name || fullName);
    setEmail(currentUser.email || email);
    setNewPassword('');
    setProfileMsg(null);
    setEditingProfile(false);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const name = fullName.trim();
    if (name.length < 2) {
      setProfileMsg({ type: 'error', text: 'Role must be at least 2 characters.' });
      return;
    }
    const nextEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setProfileMsg({ type: 'error', text: 'Enter a valid email address.' });
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
        email: nextEmail,
        ...(password ? { newPassword: password } : {}),
      });
      applyUser(me);
      setNewPassword('');
      setEditingProfile(false);
      setProfileMsg({
        type: 'success',
        text: password ? 'Account and password updated.' : 'Account updated.',
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
    if (!isAbsoluteFolderPath(nextPath)) {
      setFolderMsg({ type: 'error', text: FOLDER_PATH_HINT });
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
  const pairs = [...(folderStatus?.pairs ?? [])].sort((a, b) => {
    const aTime = a.lastSyncedAt ? Date.parse(a.lastSyncedAt) : 0;
    const bTime = b.lastSyncedAt ? Date.parse(b.lastSyncedAt) : 0;
    if (bTime !== aTime) return bTime - aTime;
    const aName = (a.jobName || a.pairKey || '').toLowerCase();
    const bName = (b.jobName || b.pairKey || '').toLowerCase();
    return aName.localeCompare(bName);
  });
  const syncOn = folderStatus?.enabled !== false;
  const initials = (fullName || currentUser.avatar || 'A').slice(0, 2).toUpperCase();
  const activeOperators = operators.filter((o) => o.isActive === 1).length;
  const operatorFormOpen = creatingOperator || editingOperatorId != null;

  return (
    <div className="admin-page">
      <div className="page-header admin-hero">
        <div>
          <h2>Admin</h2>
          <p>Manage your account, mobile operators, and automatic job imports.</p>
        </div>
        <div className="admin-hero-meta">
          <div className="admin-meta-chip">
            <Smartphone size={14} />
            <span>
              <strong>{operatorsLoading ? '—' : activeOperators}</strong>
              {' '}active operator{activeOperators === 1 ? '' : 's'}
            </span>
          </div>
          <div className={`admin-meta-chip ${syncOn ? 'is-ok' : 'is-warn'}`}>
            <FolderSync size={14} />
            <span>{syncOn ? 'Auto-sync on' : 'Auto-sync off'}</span>
          </div>
          <div className="admin-meta-chip">
            <Archive size={14} />
            <span>
              <strong>{archivesLoading ? '—' : archivedJobs.length}</strong>
              {' '}archived
            </span>
          </div>
        </div>
      </div>

      <div className="admin-section-label">Access</div>
      <div className="admin-people-grid">
        <div className="card admin-panel">
          <div className="card-header">
            <div className="admin-panel-heading">
              <div className="admin-icon-badge">
                <User size={16} />
              </div>
              <div>
                <div className="card-title">Your account</div>
                <div className="card-subtitle">Sign-in details for this portal.</div>
              </div>
            </div>
            {!editingProfile && (
              <button className="btn btn-secondary btn-sm" type="button" onClick={startEditProfile}>
                <Pencil size={14} />
                Edit
              </button>
            )}
          </div>

          {editingProfile ? (
            <form className="card-body admin-stack" onSubmit={handleSaveProfile}>
              <div className="admin-form-grid">
                <div className="form-group">
                  <label className="form-label">Display name</label>
                  <input
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Admin"
                    disabled={savingProfile}
                    autoComplete="organization-title"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={savingProfile}
                    autoComplete="email"
                  />
                </div>
                <div className="form-group admin-form-grid-span">
                  <label className="form-label">New password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    disabled={savingProfile}
                    autoComplete="new-password"
                  />
                  <div className="form-hint">Optional. At least 6 characters if you set a new one.</div>
                </div>
              </div>
              {profileMsg && <Message type={profileMsg.type} text={profileMsg.text} />}
              <div className="admin-form-actions">
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
                    <div className="admin-field-label">Name</div>
                    <div className="admin-profile-value">{fullName || '—'}</div>
                  </div>
                  <div>
                    <div className="admin-field-label">Email</div>
                    <div className="admin-profile-value">{email || '—'}</div>
                  </div>
                  <div>
                    <div className="admin-field-label">Password</div>
                    <div className="admin-profile-value admin-password-mask">••••••••</div>
                  </div>
                </div>
              </div>
              {profileMsg && <div className="admin-inline-msg"><Message type={profileMsg.type} text={profileMsg.text} /></div>}
            </div>
          )}
        </div>

        <div className="card admin-panel">
          <div className="card-header">
            <div className="admin-panel-heading">
              <div className="admin-icon-badge is-blue">
                <Smartphone size={16} />
              </div>
              <div>
                <div className="card-title">Mobile operators</div>
                <div className="card-subtitle">Names and passwords for the mobile app.</div>
              </div>
            </div>
            {!operatorFormOpen && (
              <button className="btn btn-primary btn-sm" type="button" onClick={startCreateOperator}>
                <Plus size={14} />
                Add
              </button>
            )}
          </div>

          {operatorFormOpen && (
            <form className="card-body admin-stack admin-operator-form" onSubmit={handleSaveOperator}>
              <div className="admin-form-banner">
                {creatingOperator ? 'New mobile operator' : 'Edit operator'}
              </div>
              <div className="admin-form-grid">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    className="form-input"
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                    placeholder="Operator name"
                    disabled={savingOperator}
                    autoComplete="name"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    type="email"
                    value={opEmail}
                    onChange={(e) => setOpEmail(e.target.value)}
                    placeholder="operator@example.com"
                    disabled={savingOperator}
                    autoComplete="email"
                  />
                </div>
                <div className="form-group admin-form-grid-span">
                  <label className="form-label">{creatingOperator ? 'Password' : 'New password'}</label>
                  <input
                    className="form-input"
                    type="password"
                    value={opPassword}
                    onChange={(e) => setOpPassword(e.target.value)}
                    placeholder={creatingOperator ? 'At least 6 characters' : 'Leave blank to keep current password'}
                    disabled={savingOperator}
                    autoComplete="new-password"
                  />
                  {!creatingOperator && (
                    <div className="form-hint">Optional. At least 6 characters if you set a new one.</div>
                  )}
                </div>
              </div>
              {operatorMsg && <Message type={operatorMsg.type} text={operatorMsg.text} />}
              <div className="admin-form-actions">
                <button className="btn btn-secondary" type="button" onClick={resetOperatorForm} disabled={savingOperator}>
                  <X size={14} />
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={savingOperator}>
                  {savingOperator ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  {savingOperator ? 'Saving…' : creatingOperator ? 'Create operator' : 'Save changes'}
                </button>
              </div>
            </form>
          )}

          <div className={`card-body ${operatorFormOpen ? 'admin-operator-list-padded' : ''}`}>
            {!operatorFormOpen && operatorMsg && (
              <div className="admin-inline-msg">
                <Message type={operatorMsg.type} text={operatorMsg.text} />
              </div>
            )}
            {operatorsLoading ? (
              <div className="admin-soft-empty">
                <RefreshCw size={16} className="animate-spin" />
                Loading operators…
              </div>
            ) : operators.length === 0 ? (
              <div className="admin-soft-empty">
                <Smartphone size={22} />
                <div>
                  <strong>No operators yet</strong>
                  <div>Add one so staff can sign in on the mobile app.</div>
                </div>
              </div>
            ) : (
              <div className="admin-operator-list">
                {operators.map((op) => {
                  const opInitials = (op.fullName || op.email || 'OP').slice(0, 2).toUpperCase();
                  const isEditing = editingOperatorId === op.id;
                  return (
                    <div key={op.id} className={`admin-operator-row ${isEditing ? 'is-active' : ''}`}>
                      <div className="admin-operator-avatar">{opInitials}</div>
                      <div className="admin-operator-info">
                        <div className="admin-operator-name">{op.fullName || '—'}</div>
                        <div className="admin-operator-email">{op.email}</div>
                      </div>
                      <span className={`badge ${op.isActive === 1 ? 'badge-success' : 'badge-failed'}`}>
                        {op.isActive === 1 ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => startEditOperator(op)}
                        disabled={savingOperator || operatorFormOpen}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="admin-section-label">Imports</div>
      <div className="card admin-panel admin-sync-panel">
        <div className="card-header">
          <div className="admin-panel-heading">
            <div className="admin-icon-badge">
              <FolderSync size={16} />
            </div>
            <div>
              <div className="card-title">Job folder sync</div>
              <div className="card-subtitle">
                Matching <code>.t4vjob</code> and <code>.xlsx</code> files become projects automatically.
              </div>
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

        <form className="card-body admin-stack" onSubmit={handleSaveFolder}>
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

          <div className="admin-form-grid admin-sync-form-grid">
            <div className="form-group admin-form-grid-span">
              <label className="form-label">Watch folder</label>
              <div className="admin-path-input">
                <FolderOpen size={16} />
                <input
                  className="form-input"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder={FOLDER_PATH_PLACEHOLDER}
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

          {folderStatus?.error && <Message type="error" text={folderStatus.error} />}
          {folderMsg && <Message type={folderMsg.type} text={folderMsg.text} />}

          <div className="admin-form-actions">
            <button className="btn btn-primary" type="submit" disabled={savingFolder || syncing}>
              {savingFolder ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              {savingFolder ? 'Saving…' : 'Save folder settings'}
            </button>
          </div>
        </form>

        <button
          type="button"
          className={`admin-jobs-head admin-collapse-toggle ${folderJobsOpen ? 'is-open' : ''}`}
          onClick={() => setFolderJobsOpen((open) => !open)}
          aria-expanded={folderJobsOpen}
        >
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
          <ChevronDown size={18} className="admin-collapse-chevron" />
        </button>

        {folderJobsOpen && (
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
                        <div className="admin-job-name">{pair.jobName || pair.pairKey}</div>
                        <div className="admin-job-id">{pair.sourceJobId || pair.pairKey}</div>
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
                      <td className="admin-muted-cell">
                        {formatRelative(pair.lastSyncedAt)}
                        {pair.message ? (
                          <div className="admin-job-msg">{pair.message}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`card admin-panel admin-archive-panel ${archivedJobsOpen ? 'is-open' : ''}`}>
        <button
          type="button"
          className="card-header admin-collapse-toggle"
          onClick={() => setArchivedJobsOpen((open) => !open)}
          aria-expanded={archivedJobsOpen}
        >
          <div className="admin-panel-heading">
            <div className="admin-icon-badge is-slate">
              <Archive size={16} />
            </div>
            <div>
              <div className="card-title">Archived jobs</div>
              <div className="card-subtitle">
                Jobs deleted from Projects. Only totals are kept — not part details.
              </div>
            </div>
          </div>
          <div className="admin-collapse-meta">
            {!archivesLoading && archivedJobs.length > 0 && (
              <span className="admin-count-pill">{archivedJobs.length}</span>
            )}
            <ChevronDown size={18} className="admin-collapse-chevron" />
          </div>
        </button>
        {archivedJobsOpen && (
          <div className="card-body admin-archive-body">
            {archivesLoading ? (
              <div className="admin-soft-empty">
                <RefreshCw size={16} className="animate-spin" />
                Loading…
              </div>
            ) : archivedJobs.length === 0 ? (
              <div className="admin-soft-empty">
                <Archive size={22} />
                <div>
                  <strong>No archived jobs</strong>
                  <div>Deleted projects will show up here.</div>
                </div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Project</th>
                      <th>Job ID</th>
                      <th>Upload</th>
                      <th>Total parts</th>
                      <th>Deleted by</th>
                      <th>Deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedJobs.map((row) => (
                      <tr key={row.id}>
                        <td className="admin-job-name">{row.jobName}</td>
                        <td>{row.projectName}</td>
                        <td className="td-mono">{row.sourceJobId}</td>
                        <td>v{row.importVersion}</td>
                        <td className="admin-parts-count">{row.totalParts}</td>
                        <td>{row.archivedByName || '—'}</td>
                        <td className="admin-muted-cell">{formatDateTime(row.archivedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
