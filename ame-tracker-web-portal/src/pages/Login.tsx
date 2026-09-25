import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { api } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const { setCurrentUser } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.login(username.trim(), password);
      if (data?.user) {
        setCurrentUser({
          id: String(data.user.id),
          name: data.user.fullName || 'Admin',
          role: data.user.role || 'ADMIN',
          avatar: (data.user.fullName || 'A').slice(0, 2).toUpperCase(),
          email: data.user.email,
        });
        navigate('/dashboard');
        return;
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-form-box">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/images.png"
            alt="AME Tracker Logo"
            style={{
              width: 170,
              height: 170,
              objectFit: 'contain',
              margin: '0 auto 16px auto',
              display: 'block',
              borderRadius: 20,
              background: '#F0FDF4',
              padding: 12,
              border: '1.5px solid #DCFCE7',
              boxShadow: '0 6px 16px rgba(4, 120, 87, 0.10)'
            }}
          />
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.5px' }}>
            AME Tracker
          </h2>
          <p style={{ color: '#6B7280', fontSize: '0.95rem', marginTop: 6, fontWeight: 500 }}>
            Sign in to Admin & Operations Portal
          </p>
        </div>

        <form className="login-form" onSubmit={handleLogin} autoComplete="off">
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              name="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              required
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="off"
                name="password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              fontSize: 13,
              fontWeight: 500,
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg login-submit"
            disabled={loading}
            style={{ marginTop: 4, height: 44 }}
          >
            {loading ? (
              <span
                className="animate-spin"
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%'
                }}
              />
            ) : null}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
}
