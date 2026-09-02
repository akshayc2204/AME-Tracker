import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban,
  Truck, BarChart3, UserCog,
  LogOut
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { api } from '../../services/api';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  to: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={18} />, to: '/dashboard' },
  // Import page disabled — jobs come from DataUploads folder sync
  // { label: 'Import', icon: <Upload size={18} />, to: '/import' },
  { label: 'Projects', icon: <FolderKanban size={18} />, to: '/projects' },
  // Manual Tracking disabled for now
  // { label: 'Manual Tracking', icon: <Barcode size={18} />, to: '/parts/track' },
  { label: 'Dispatch', icon: <Truck size={18} />, to: '/dispatch' },
  { label: 'Reports', icon: <BarChart3 size={18} />, to: '/reports' },
  { label: 'Admin', icon: <UserCog size={18} />, to: '/admin' },
];

export default function Sidebar() {
  const { currentUser } = useApp();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px' }}>
        <img
          src="/images.png"
          alt="AME Tracker Logo"
          style={{ width: 75, height: 75, objectFit: 'contain', borderRadius: 10, background: '#ffffff', padding: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.18)', flexShrink: 0 }}
        />
        <div className="sidebar-logo-text">
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>AME Tracker</h1>
          <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>Parts & Shipment</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge ? <span className="sidebar-badge">{item.badge}</span> : null}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div
          className="sidebar-user"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/admin')}
          title="Account settings"
        >
          <div className="user-avatar">{currentUser.avatar}</div>
          <div className="sidebar-user-info">
            <strong>{currentUser.name}</strong>
            {currentUser.email ? <span>{currentUser.email}</span> : null}
          </div>
        </div>
        <button
          className="sidebar-item"
          style={{ marginTop: 4, width: '100%', color: 'rgba(255,255,255,0.5)' }}
          onClick={async () => {
            try {
              await api.logout();
            } finally {
              navigate('/login');
            }
          }}
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
