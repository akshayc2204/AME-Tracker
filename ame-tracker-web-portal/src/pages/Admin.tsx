import { useEffect, useState } from 'react';
import {
  Upload, RefreshCw, FolderOpen, CheckCircle, User, Pencil,
  AlertCircle, Archive, Smartphone, Plus, X, ChevronDown, Save,
} from 'lucide-react';

import { api } from '../services/api';
import { useApp } from '../store/AppContext';
import {
  pickFolderFromDisk,
  processAndUploadFolder,
  type LocalFolderPair,
  type FolderUploadProgress,
  type FolderUploadResult,
} from '../utils/browserFolderSync';

type PortalUser = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  isActive: number;
  createdAt?: string;
};

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FolderUploadProgress | null>(null);
  const [uploadSummary, setUploadSummary] = useState<FolderUploadResult | null>(null);
  const [folderPairs, setFolderPairs] = useState<LocalFolderPair[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
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
    setArchivesLoading(true);
    try {
      const [me, archives] = await Promise.all([
        api.getMe().catch(() => null),
        api.getJobArchives().catch(() => []),
        loadOperators(),
      ]);
      if (me) applyUser(me);
      if (Array.isArray(archives)) setArchivedJobs(archives);
    } catch (err: unknown) {
      setFolderMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load admin settings',
      });
    } finally {
      setArchivesLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
    const nextEmail = opEmail.trim();
    const password = opPassword.trim();

    if (name.length < 2) {
      setOperatorMsg({ type: 'error', text: 'Operator name must be at least 2 characters.' });
      return;
    }
    if (nextEmail.length < 2) {
      setOperatorMsg({ type: 'error', text: 'Enter a username.' });
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
    const nextEmail = email.trim();
    if (nextEmail.length < 2) {
      setProfileMsg({ type: 'error', text: 'Enter a username.' });
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

  async function handleUploadFolder() {
    setFolderMsg(null);
    try {
      const { folderName, files } = await pickFolderFromDisk();
      if (!files || files.length === 0) {
        setFolderMsg({ type: 'error', text: 'The selected folder is empty.' });
        return;
      }

      setUploading(true);
      setFolderJobsOpen(true);

      const result = await processAndUploadFolder(folderName, files, (progress) => {
        setUploadProgress(progress);
        setFolderPairs([...progress.pairs]);
      });

      setUploadSummary(result);
      setFolderPairs([...result.pairs]);

      const partsCount = result.pairs.reduce((acc, p) => acc + (p.unitsImported || 0), 0);
      setFolderMsg({
        type: 'success',
        text: `Folder "${result.folderName}" uploaded: ${result.imported} imported (${partsCount} pieces), ${result.skipped} already in database, ${result.failed} failed.`,
      });
    } catch (err: any) {
      if (err?.message !== 'USER_CANCELLED') {
        setFolderMsg({
          type: 'error',
          text: err instanceof Error ? err.message : 'Could not upload folder',
        });
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  const initials = (fullName || currentUser.avatar || 'A').slice(0, 2).toUpperCase();
  const activeOperators = operators.filter((o) => o.isActive === 1).length;
  const operatorFormOpen = creatingOperator || editingOperatorId != null;

  return (
    <div className="admin-page">
      <div className="page-header admin-hero">
        <div>
          <h2>Admin</h2>
          <p>Manage your account, mobile operators, and job import folder.</p>
        </div>
        <div className="admin-hero-meta">
          <div className="admin-meta-chip">
            <Smartphone size={14} />
            <span>
              <strong>{operatorsLoading ? '—' : activeOperators}</strong>
              {' '}active operator{activeOperators === 1 ? '' : 's'}
            </span>
          </div>
          <div className={`admin-meta-chip ${uploadSummary ? 'is-ok' : ''}`}>
            <FolderOpen size={14} />
            <span>{uploadSummary ? `${uploadSummary.folderName} (${uploadSummary.imported} imported)` : 'Folder upload'}</span>
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
                  <label className="form-label">Username</label>
                  <input
                    className="form-input"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Username"
                    disabled={savingProfile}
                    autoComplete="off"
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
                    <div className="admin-field-label">Username</div>
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
                  <label className="form-label">Username</label>
                  <input
                    className="form-input"
                    type="text"
                    name="operator-username"
                    value={opEmail}
                    onChange={(e) => setOpEmail(e.target.value)}
                    placeholder="Username"
                    disabled={savingOperator}
                    autoComplete="off"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    data-protonpass-ignore="true"
                    data-bwignore="true"
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
              <Upload size={16} />
            </div>
            <div>
              <div className="card-title">Manual Folder Upload</div>
              <div className="card-subtitle">
                Select a folder containing <code>.t4vjob</code> + <code>.xlsx</code> pairs to check and upload directly.
              </div>
            </div>
          </div>
          <div className="admin-sync-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void handleUploadFolder()}
              disabled={uploading}
            >
              {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Uploading…' : 'Upload Folder'}
            </button>
          </div>
        </div>

        <div className="card-body admin-stack">
          {!uploading && !uploadSummary && folderPairs.length === 0 ? (
            <div
              className="admin-folder-dropzone"
              onClick={() => void handleUploadFolder()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void handleUploadFolder(); }}
            >
              <div className="admin-folder-dropzone-icon">
                <Upload size={24} />
              </div>
              <div className="admin-folder-dropzone-text">
                <strong>Click to select a folder from your computer</strong>
                <span>Choose any folder with matching <code>.t4vjob</code> and <code>.xlsx</code> files. Existing jobs in the server are checked automatically before uploading.</span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" style={{ pointerEvents: 'none' }}>
                <FolderOpen size={14} />
                Browse Folder
              </button>
            </div>
          ) : (
            <>
              <div className="admin-folder-active-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FolderOpen size={18} color="#047857" />
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#047857' }}>
                      {uploadProgress?.folderName || uploadSummary?.folderName || 'Selected Folder'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#4B5563', marginTop: 2 }}>
                      {uploading
                        ? 'Checking files and uploading new jobs to server…'
                        : `Upload complete — ${folderPairs.length} job pair${folderPairs.length === 1 ? '' : 's'} processed`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleUploadFolder()}
                  disabled={uploading}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Upload size={14} />
                  Upload Another Folder
                </button>
              </div>

              {uploading && uploadProgress && (
                <div className="admin-upload-progress-box">
                  <div className="admin-upload-progress-header">
                    <span>{uploadProgress.message || 'Processing…'}</span>
                    <span>{uploadProgress.percent}% ({uploadProgress.currentIndex}/{uploadProgress.total})</span>
                  </div>
                  <div className="admin-upload-progress-bar">
                    <div
                      className="admin-upload-progress-fill"
                      style={{ width: `${Math.max(4, uploadProgress.percent)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="admin-sync-stats">
                <div className="admin-sync-stat">
                  <span>Total Pairs</span>
                  <strong>{uploadProgress ? uploadProgress.total : (uploadSummary?.totalPairs ?? folderPairs.length)}</strong>
                </div>
                <div className="admin-sync-stat" style={{ borderColor: '#A7F3D0' }}>
                  <span style={{ color: '#047857' }}>Imported</span>
                  <strong style={{ color: '#047857' }}>
                    {uploadProgress ? uploadProgress.imported : (uploadSummary?.imported ?? folderPairs.filter((p) => p.status === 'SYNCED').length)}
                  </strong>
                </div>
                <div className="admin-sync-stat">
                  <span>Already in DB</span>
                  <strong>
                    {uploadProgress ? uploadProgress.skipped : (uploadSummary?.skipped ?? folderPairs.filter((p) => p.status === 'SKIPPED').length)}
                  </strong>
                </div>
                <div className="admin-sync-stat is-warn">
                  <span>Waiting for files</span>
                  <strong>
                    {uploadProgress ? uploadProgress.incomplete : (uploadSummary?.incomplete ?? folderPairs.filter((p) => p.status === 'INCOMPLETE').length)}
                  </strong>
                </div>
                <div className="admin-sync-stat is-error">
                  <span>Failed</span>
                  <strong>
                    {uploadProgress ? uploadProgress.failed : (uploadSummary?.failed ?? folderPairs.filter((p) => p.status === 'FAILED').length)}
                  </strong>
                </div>
              </div>
            </>
          )}

          {folderMsg && <Message type={folderMsg.type} text={folderMsg.text} />}
        </div>

        {folderPairs.length > 0 && (
          <>
            <button
              type="button"
              className={`admin-jobs-head admin-collapse-toggle ${folderJobsOpen ? 'is-open' : ''}`}
              onClick={() => setFolderJobsOpen((open) => !open)}
              aria-expanded={folderJobsOpen}
            >
              <div>
                <div className="card-title">Jobs in this folder</div>
                <div className="card-subtitle">
                  {folderPairs.length === 1
                    ? '1 job file pair processed'
                    : `${folderPairs.length} job file pairs processed`}
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
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folderPairs.map((pair) => (
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
                          {pair.message || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
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
