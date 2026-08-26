import { useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/parts/track?code=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  }

  return (
    <header className="topbar">
      <div style={{ flex: 1 }}>
        <div className="topbar-title">{title}</div>
        {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
      </div>

      <form onSubmit={handleSearch} className="topbar-search">
        <Search />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search parts, jobs, tracking…"
        />
      </form>

      <div className="topbar-actions">
        <button className="icon-btn" title="Refresh" onClick={() => window.location.reload()}>
          <RefreshCw />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
          <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{currentUser.avatar}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{currentUser.name}</span>
            <span style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 500 }}>{currentUser.role.replace('_', ' ')}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
