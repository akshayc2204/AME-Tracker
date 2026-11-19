import { useEffect, useState, type FormEvent } from 'react';
import { Database, Pencil, RefreshCw, Save, Server, Smartphone, X } from 'lucide-react';
import { api, type DesktopSettingsBody } from '../services/api';

type Status = { type: 'error' | 'success'; text: string } | null;
type PostgresForm = DesktopSettingsBody['postgres'];
type FabshopForm = DesktopSettingsBody['fabshop'];

const defaultPostgres: PostgresForm = { host: 'localhost', port: 5432, database: 'ame_tracker', user: 'postgres', password: '' };
const defaultFabshop: FabshopForm = { server: 'localhost', port: 1433, database: 'TrimbleFabShop (US Metric)', user: 'ame_readonly', password: '', encrypt: false };

export default function DatabaseSettings() {
  const [postgres, setPostgres] = useState<PostgresForm>(defaultPostgres);
  const [fabshop, setFabshop] = useState<FabshopForm>(defaultFabshop);
  const [postgresPasswordSet, setPostgresPasswordSet] = useState(false);
  const [fabshopPasswordSet, setFabshopPasswordSet] = useState(false);
  const [configPath, setConfigPath] = useState('');
  const [desktopMode, setDesktopMode] = useState(false);
  const [lanApiUrls, setLanApiUrls] = useState<string[]>([]);
  const [apiPort, setApiPort] = useState(3000);
  const [restartRequired, setRestartRequired] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editingPostgres, setEditingPostgres] = useState(false);
  const [editingFabshop, setEditingFabshop] = useState(false);
  const [postgresForm, setPostgresForm] = useState<PostgresForm>(defaultPostgres);
  const [fabshopForm, setFabshopForm] = useState<FabshopForm>(defaultFabshop);

  const [postgresMsg, setPostgresMsg] = useState<Status>(null);
  const [fabshopMsg, setFabshopMsg] = useState<Status>(null);
  const [savingPostgres, setSavingPostgres] = useState(false);
  const [savingFabshop, setSavingFabshop] = useState(false);
  const [testingPostgres, setTestingPostgres] = useState(false);
  const [testingFabshop, setTestingFabshop] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.desktop.getConfig()
      .then((config) => {
        if (cancelled || !config) return;
        setDesktopMode(config.desktopMode);
        setConfigPath(config.configPath);
        setLanApiUrls(config.lanApiUrls || []);
        setApiPort(config.port || 3000);
        setPostgresPasswordSet(config.postgres.passwordSet);
        setFabshopPasswordSet(config.fabshop.passwordSet);
        const pg: PostgresForm = { host: config.postgres.host, port: config.postgres.port, database: config.postgres.database, user: config.postgres.user, password: '' };
        const fb: FabshopForm = { server: config.fabshop.server, port: config.fabshop.port, database: config.fabshop.database, user: config.fabshop.user, password: '', encrypt: config.fabshop.encrypt };
        setPostgres(pg);
        setFabshop(fb);
      })
      .catch((err: unknown) => {
        setPostgresMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not load settings' });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── PostgreSQL ──────────────────────────────────────────────
  function startEditPostgres() { setPostgresForm({ ...postgres, password: '' }); setPostgresMsg(null); setEditingPostgres(true); }
  function cancelEditPostgres() { setEditingPostgres(false); setPostgresMsg(null); }
  async function savePostgres(e: FormEvent) {
    e.preventDefault();
    setSavingPostgres(true); setPostgresMsg(null);
    try {
      const saved = await api.desktop.saveConfig({ postgres: postgresForm, fabshop });
      setPostgresPasswordSet(Boolean(saved?.postgres.passwordSet));
      setPostgres({ ...postgresForm, password: '' });
      setRestartRequired(Boolean(saved?.restartRequired));
      setPostgresMsg({ type: 'success', text: saved?.message || 'Saved.' });
      setEditingPostgres(false);
    } catch (err: unknown) {
      setPostgresMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save' });
    } finally { setSavingPostgres(false); }
  }
  async function testPostgres() {
    setTestingPostgres(true); setPostgresMsg(null);
    try {
      const result = await api.desktop.testPostgres(postgresForm);
      setPostgresMsg({ type: 'success', text: result?.message || 'Connected.' });
    } catch (err: unknown) {
      setPostgresMsg({ type: 'error', text: err instanceof Error ? err.message : 'Connection failed' });
    } finally { setTestingPostgres(false); }
  }

  // ── Trimble FabShop ─────────────────────────────────────────
  function startEditFabshop() { setFabshopForm({ ...fabshop, password: '' }); setFabshopMsg(null); setEditingFabshop(true); }
  function cancelEditFabshop() { setEditingFabshop(false); setFabshopMsg(null); }
  async function saveFabshop(e: FormEvent) {
    e.preventDefault();
    setSavingFabshop(true); setFabshopMsg(null);
    try {
      const saved = await api.desktop.saveConfig({ postgres, fabshop: fabshopForm });
      setFabshopPasswordSet(Boolean(saved?.fabshop.passwordSet));
      setFabshop({ ...fabshopForm, password: '' });
      setFabshopMsg({ type: 'success', text: saved?.message || 'Saved.' });
      setEditingFabshop(false);
    } catch (err: unknown) {
      setFabshopMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not save' });
    } finally { setSavingFabshop(false); }
  }
  async function testFabshop() {
    setTestingFabshop(true); setFabshopMsg(null);
    try {
      const result = await api.desktop.testFabshop(fabshopForm);
      setFabshopMsg({ type: 'success', text: result?.message || 'Connected.' });
    } catch (err: unknown) {
      setFabshopMsg({ type: 'error', text: err instanceof Error ? err.message : 'Connection failed' });
    } finally { setTestingFabshop(false); }
  }

  async function restart() {
    setRestarting(true);
    try {
      const result = await api.desktop.restart();
      setPostgresMsg({ type: result?.restarting ? 'success' : 'error', text: result?.message || 'Restart requested.' });
    } catch (err: unknown) {
      setPostgresMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not restart' });
      setRestarting(false);
    }
  }

  if (loading) {
    return (
      <div className="card admin-panel">
        <div className="card-body admin-soft-empty">
          <RefreshCw size={16} className="animate-spin" />
          Loading database settings…
        </div>
      </div>
    );
  }

  return (
    <div className="admin-db-grid">

      {/* ── PostgreSQL card ── */}
      <div className="card admin-panel">
        <div className="card-header">
          <div className="admin-panel-heading">
            <div className="admin-icon-badge">
              <Database size={16} />
            </div>
            <div>
              <div className="card-title">PostgreSQL</div>
              <div className="card-subtitle">AME Tracker data on this PC.</div>
            </div>
          </div>
          {!editingPostgres && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={startEditPostgres}>
              <Pencil size={14} />
              Edit
            </button>
          )}
        </div>

        {editingPostgres ? (
          <form className="card-body admin-stack" onSubmit={(e) => void savePostgres(e)}>
            <div className="admin-form-grid">
              <Field label="Host" value={postgresForm.host} onChange={(v) => setPostgresForm((p) => ({ ...p, host: v }))} />
              <Field label="Port" type="number" value={String(postgresForm.port)} onChange={(v) => setPostgresForm((p) => ({ ...p, port: Number(v) || 5432 }))} />
              <Field label="Database" value={postgresForm.database} onChange={(v) => setPostgresForm((p) => ({ ...p, database: v }))} />
              <Field label="User" value={postgresForm.user} onChange={(v) => setPostgresForm((p) => ({ ...p, user: v }))} />
              <div className="form-group admin-form-grid-span">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={postgresForm.password || ''}
                  autoComplete="new-password"
                  placeholder={postgresPasswordSet ? 'Saved — leave blank to keep it' : 'PostgreSQL password'}
                  onChange={(e) => setPostgresForm((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
            </div>
            {postgresMsg && <div className={`admin-msg ${postgresMsg.type === 'error' ? 'is-error' : 'is-success'}`}>{postgresMsg.text}</div>}
            <div className="admin-form-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void testPostgres()} disabled={testingPostgres || savingPostgres}>
                {testingPostgres ? <RefreshCw size={16} className="animate-spin" /> : null}
                Test connection
              </button>
              <button className="btn btn-secondary" type="button" onClick={cancelEditPostgres} disabled={savingPostgres}>
                <X size={14} />
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={savingPostgres || testingPostgres}>
                {savingPostgres ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {savingPostgres ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="card-body">
            <div className="admin-profile-fields">
              <InfoRow label="Host" value={`${postgres.host}:${postgres.port}`} />
              <InfoRow label="Database" value={postgres.database} />
              <InfoRow label="User" value={postgres.user} />
              <InfoRow label="Password" value={postgresPasswordSet ? '••••••••' : 'Not set'} />
            </div>
            {postgresMsg && <div className={`admin-msg ${postgresMsg.type === 'error' ? 'is-error' : 'is-success'}`} style={{ marginTop: 12 }}>{postgresMsg.text}</div>}
            {restartRequired && (
              <div className="admin-form-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-secondary" type="button" onClick={() => void restart()} disabled={restarting}>
                  {restarting ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Restart app to apply
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Trimble FabShop card ── */}
      <div className="card admin-panel">
        <div className="card-header">
          <div className="admin-panel-heading">
            <div className="admin-icon-badge is-slate">
              <Server size={16} />
            </div>
            <div>
              <div className="card-title">Trimble FabShop</div>
              <div className="card-subtitle">Read-only SQL Server connection.</div>
            </div>
          </div>
          {!editingFabshop && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={startEditFabshop}>
              <Pencil size={14} />
              Edit
            </button>
          )}
        </div>

        {editingFabshop ? (
          <form className="card-body admin-stack" onSubmit={(e) => void saveFabshop(e)}>
            <div className="admin-form-grid">
              <Field label="Server" value={fabshopForm.server} onChange={(v) => setFabshopForm((p) => ({ ...p, server: v }))} />
              <Field label="Port" type="number" value={String(fabshopForm.port)} onChange={(v) => setFabshopForm((p) => ({ ...p, port: Number(v) || 1433 }))} />
              <Field label="Database" value={fabshopForm.database} onChange={(v) => setFabshopForm((p) => ({ ...p, database: v }))} />
              <Field label="User" value={fabshopForm.user} onChange={(v) => setFabshopForm((p) => ({ ...p, user: v }))} />
              <div className="form-group admin-form-grid-span">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={fabshopForm.password || ''}
                  autoComplete="new-password"
                  placeholder={fabshopPasswordSet ? 'Saved — leave blank to keep it' : 'ame_readonly password'}
                  onChange={(e) => setFabshopForm((p) => ({ ...p, password: e.target.value }))}
                />
                <div className="form-hint">Use ame_readonly. The sa login is rejected.</div>
              </div>
            </div>
            <label className="form-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={fabshopForm.encrypt}
                onChange={(e) => setFabshopForm((p) => ({ ...p, encrypt: e.target.checked }))}
              />
              Encrypt connection
            </label>
            {fabshopMsg && <div className={`admin-msg ${fabshopMsg.type === 'error' ? 'is-error' : 'is-success'}`}>{fabshopMsg.text}</div>}
            <div className="admin-form-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void testFabshop()} disabled={testingFabshop || savingFabshop}>
                {testingFabshop ? <RefreshCw size={16} className="animate-spin" /> : null}
                Test connection
              </button>
              <button className="btn btn-secondary" type="button" onClick={cancelEditFabshop} disabled={savingFabshop}>
                <X size={14} />
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={savingFabshop || testingFabshop}>
                {savingFabshop ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {savingFabshop ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="card-body">
            <div className="admin-profile-fields">
              <InfoRow label="Server" value={`${fabshop.server}:${fabshop.port}`} />
              <InfoRow label="Database" value={fabshop.database} />
              <InfoRow label="User" value={fabshop.user} />
              <InfoRow label="Password" value={fabshopPasswordSet ? '••••••••' : 'Not set'} />
              <InfoRow label="Encrypt" value={fabshop.encrypt ? 'Yes' : 'No'} />
            </div>
            {fabshopMsg && <div className={`admin-msg ${fabshopMsg.type === 'error' ? 'is-error' : 'is-success'}`} style={{ marginTop: 12 }}>{fabshopMsg.text}</div>}
          </div>
        )}
      </div>

      {/* ── LAN / Mobile API URL card ── */}
      <div className="card admin-panel" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header">
          <div className="admin-panel-heading">
            <div className="admin-icon-badge is-blue">
              <Smartphone size={16} />
            </div>
            <div>
              <div className="card-title">Mobile App API Address</div>
              <div className="card-subtitle">Use this URL in the mobile app to connect to this server.</div>
            </div>
          </div>
        </div>
        <div className="card-body admin-stack">
          <div className="form-group">
            <label className="form-label">API address for the mobile app</label>
            <input
              className="form-input"
              readOnly
              value={lanApiUrls[0] || `http://127.0.0.1:${apiPort}`}
              onFocus={(e) => e.target.select()}
            />
            {lanApiUrls.length > 1 && (
              <div className="form-hint">
                Also reachable at: {lanApiUrls.slice(1).join(', ')}
              </div>
            )}
            <div className="form-hint">
              Enter this address in the mobile app settings. The phone must be on the same Wi-Fi network as this PC.
            </div>
          </div>
        </div>
      </div>

      {!desktopMode && (
        <div className="form-hint" style={{ gridColumn: '1 / -1' }}>
          Open AME Tracker as the desktop app to apply these settings. Config: {configPath}
        </div>
      )}
    </div>
  );

}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="admin-field-label">{label}</div>
      <div className="admin-profile-value">{value}</div>
    </div>
  );
}


