import { useEffect, useState, type FormEvent } from 'react';
import { Database, RefreshCw, Server, Smartphone } from 'lucide-react';
import { api, type DesktopSettingsBody } from '../services/api';

type Status = { type: 'error' | 'success'; text: string } | null;

const emptyForm: DesktopSettingsBody = {
  postgres: { host: 'localhost', port: 5432, database: 'ame_tracker', user: 'postgres', password: '' },
  fabshop: {
    server: 'localhost',
    port: 1433,
    database: 'TrimbleFabShop (US Metric)',
    user: 'ame_readonly',
    password: '',
    encrypt: false,
  },
};

export default function DatabaseSettings() {
  const [form, setForm] = useState<DesktopSettingsBody>(emptyForm);
  const [configPath, setConfigPath] = useState('');
  const [desktopMode, setDesktopMode] = useState(false);
  const [lanApiUrls, setLanApiUrls] = useState<string[]>([]);
  const [apiPort, setApiPort] = useState(3000);
  const [postgresPasswordSet, setPostgresPasswordSet] = useState(false);
  const [fabshopPasswordSet, setFabshopPasswordSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'postgres' | 'fabshop' | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [message, setMessage] = useState<Status>(null);

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
        setForm({
          postgres: {
            host: config.postgres.host,
            port: config.postgres.port,
            database: config.postgres.database,
            user: config.postgres.user,
            password: '',
          },
          fabshop: {
            server: config.fabshop.server,
            port: config.fabshop.port,
            database: config.fabshop.database,
            user: config.fabshop.user,
            password: '',
            encrypt: config.fabshop.encrypt,
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMessage({
            type: 'error',
            text: err instanceof Error ? err.message : 'Could not load database settings',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.desktop.saveConfig(form);
      setPostgresPasswordSet(Boolean(saved?.postgres.passwordSet));
      setFabshopPasswordSet(Boolean(saved?.fabshop.passwordSet));
      setForm((prev) => ({
        postgres: { ...prev.postgres, password: '' },
        fabshop: { ...prev.fabshop, password: '' },
      }));
      setRestartRequired(Boolean(saved?.restartRequired));
      setMessage({ type: 'success', text: saved?.message || 'Saved.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save settings' });
    } finally {
      setSaving(false);
    }
  }

  async function testPostgres() {
    setTesting('postgres');
    setMessage(null);
    try {
      const result = await api.desktop.testPostgres(form.postgres);
      setMessage({ type: 'success', text: result?.message || 'PostgreSQL connection succeeded.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'PostgreSQL connection failed' });
    } finally {
      setTesting(null);
    }
  }

  async function testFabshop() {
    setTesting('fabshop');
    setMessage(null);
    try {
      const result = await api.desktop.testFabshop(form.fabshop);
      setMessage({ type: 'success', text: result?.message || 'Trimble connection succeeded.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Trimble connection failed' });
    } finally {
      setTesting(null);
    }
  }

  async function restart() {
    setRestarting(true);
    setMessage(null);
    try {
      const result = await api.desktop.restart();
      setMessage({ type: result?.restarting ? 'success' : 'error', text: result?.message || 'Restart requested.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not restart' });
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
    <form onSubmit={save}>
      <div className="card admin-panel" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="admin-panel-heading">
            <div className="admin-icon-badge">
              <Smartphone size={16} />
            </div>
            <div>
              <div className="card-title">Mobile app</div>
              <div className="card-subtitle">
                Phones on this Wi-Fi talk to the AME Tracker window running on this PC.
              </div>
            </div>
          </div>
        </div>
        <div className="card-body admin-stack">
          <div className="form-group">
            <label className="form-label">API address for the APK</label>
            <input
              className="form-input"
              readOnly
              value={lanApiUrls[0] || `http://127.0.0.1:${apiPort}`}
            />
            <div className="form-hint">
              Keep AME Tracker open. Connect the phone to the same Wi-Fi (not mobile data), then sign in as an operator.
              {lanApiUrls.length > 1 ? ` Also reachable at ${lanApiUrls.slice(1).join(', ')}.` : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-db-grid">
        <div className="card admin-panel">
          <div className="card-header">
            <div className="admin-panel-heading">
              <div className="admin-icon-badge">
                <Database size={16} />
              </div>
              <div>
                <div className="card-title">PostgreSQL</div>
                <div className="card-subtitle">AME Tracker data on this PC. Installed beside the app.</div>
              </div>
            </div>
          </div>
          <div className="card-body admin-stack">
            <div className="admin-form-grid">
              <Field label="Host" value={form.postgres.host} onChange={(host) => setForm((prev) => ({ ...prev, postgres: { ...prev.postgres, host } }))} />
              <Field label="Port" type="number" value={String(form.postgres.port)} onChange={(value) => setForm((prev) => ({ ...prev, postgres: { ...prev.postgres, port: Number(value) || 5432 } }))} />
              <Field label="Database" value={form.postgres.database} onChange={(database) => setForm((prev) => ({ ...prev, postgres: { ...prev.postgres, database } }))} />
              <Field label="User" value={form.postgres.user} onChange={(user) => setForm((prev) => ({ ...prev, postgres: { ...prev.postgres, user } }))} />
              <div className="form-group admin-form-grid-span">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={form.postgres.password || ''}
                  autoComplete="new-password"
                  placeholder={postgresPasswordSet ? 'Saved — leave blank to keep it' : 'PostgreSQL password'}
                  onChange={(event) => setForm((prev) => ({ ...prev, postgres: { ...prev.postgres, password: event.target.value } }))}
                />
              </div>
            </div>
            <div className="admin-form-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void testPostgres()} disabled={testing !== null || saving}>
                {testing === 'postgres' ? <RefreshCw size={16} className="animate-spin" /> : null}
                Test connection
              </button>
            </div>
          </div>
        </div>

        <div className="card admin-panel">
          <div className="card-header">
            <div className="admin-panel-heading">
              <div className="admin-icon-badge is-slate">
                <Server size={16} />
              </div>
              <div>
                <div className="card-title">Trimble FabShop</div>
                <div className="card-subtitle">Read-only SQL Server already running on this PC.</div>
              </div>
            </div>
          </div>
          <div className="card-body admin-stack">
            <div className="admin-form-grid">
              <Field label="Server" value={form.fabshop.server} onChange={(server) => setForm((prev) => ({ ...prev, fabshop: { ...prev.fabshop, server } }))} />
              <Field label="Port" type="number" value={String(form.fabshop.port)} onChange={(value) => setForm((prev) => ({ ...prev, fabshop: { ...prev.fabshop, port: Number(value) || 1433 } }))} />
              <Field label="Database" value={form.fabshop.database} onChange={(database) => setForm((prev) => ({ ...prev, fabshop: { ...prev.fabshop, database } }))} />
              <Field label="User" value={form.fabshop.user} onChange={(user) => setForm((prev) => ({ ...prev, fabshop: { ...prev.fabshop, user } }))} />
              <div className="form-group admin-form-grid-span">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={form.fabshop.password || ''}
                  autoComplete="new-password"
                  placeholder={fabshopPasswordSet ? 'Saved — leave blank to keep it' : 'ame_readonly password'}
                  onChange={(event) => setForm((prev) => ({ ...prev, fabshop: { ...prev.fabshop, password: event.target.value } }))}
                />
                <div className="form-hint">Use ame_readonly. The sa login is rejected.</div>
              </div>
            </div>
            <label className="form-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.fabshop.encrypt}
                onChange={(event) => setForm((prev) => ({ ...prev, fabshop: { ...prev.fabshop, encrypt: event.target.checked } }))}
              />
              Encrypt connection
            </label>
            <div className="admin-form-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void testFabshop()} disabled={testing !== null || saving}>
                {testing === 'fabshop' ? <RefreshCw size={16} className="animate-spin" /> : null}
                Test connection
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card admin-panel" style={{ marginTop: 16 }}>
        <div className="card-body admin-stack">
          <div className="form-hint">
            {desktopMode
              ? `Settings file: ${configPath}. Anyone signed in on this PC can change these values. Closing the window stops the app.`
              : 'These fields show the current server settings. Save them from the AME Tracker desktop window so they are stored outside the app.'}
          </div>
          {message && (
            <div className={`admin-msg ${message.type === 'error' ? 'is-error' : 'is-success'}`}>
              {message.text}
            </div>
          )}
          <div className="admin-form-actions">
            {restartRequired && (
              <button className="btn btn-secondary" type="button" onClick={() => void restart()} disabled={restarting || saving}>
                {restarting ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Restart app
              </button>
            )}
            <button className="btn btn-primary" type="submit" disabled={saving || testing !== null}>
              {saving ? <RefreshCw size={16} className="animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save database settings'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
