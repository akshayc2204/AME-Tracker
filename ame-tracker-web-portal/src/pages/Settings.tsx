import { Settings as SettingsIcon, Bell, Shield, Database, Palette } from 'lucide-react';

export default function Settings() {
  return (
    <>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Application configuration, notifications, and system preferences</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        <div className="card" style={{ height: 'fit-content' }}>
          <div style={{ padding: '8px' }}>
            {[
              { icon: <SettingsIcon size={15} />, label: 'General' },
              { icon: <Bell size={15} />, label: 'Notifications' },
              { icon: <Shield size={15} />, label: 'Security' },
              { icon: <Database size={15} />, label: 'Data & Import' },
              { icon: <Palette size={15} />, label: 'Appearance' },
            ].map((s, i) => (
              <div key={s.label} className={`tree-item ${i === 0 ? 'selected' : ''}`}>
                {s.icon}<span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">General Settings</div></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">Application Name</label>
              <input className="form-input" defaultValue="AME Parts Tracking & Shipment Management System" />
            </div>
            <div className="form-group">
              <label className="form-label">Default Dashboard Refresh (seconds)</label>
              <input className="form-input" type="number" defaultValue={30} />
            </div>
            <div className="form-group">
              <label className="form-label">Timezone</label>
              <select className="form-select">
                <option>Asia/Kuwait (AST UTC+3)</option>
                <option>Asia/Dubai (GST UTC+4)</option>
                <option>UTC</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date Format</label>
              <select className="form-select">
                <option>DD/MM/YYYY</option>
                <option>MM/DD/YYYY</option>
                <option>YYYY-MM-DD</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary">Save Settings</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
