import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import CTSLogo from './CTSLogo';

const API_BASE = process.env.REACT_APP_API_URL || '';

function SubcontractorLogin({ onLogin }) {
  const [mode, setMode]         = useState('login'); // 'login' | 'set-password'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [token, setToken]       = useState('');
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [loading, setLoading]   = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) { setToken(t); setMode('set-password'); }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/sub/auth/login`, { email, password });
      const { token: authToken, user } = res.data;
      localStorage.setItem('cts_sub_token', authToken);
      localStorage.setItem('cts_sub_user', JSON.stringify(user));
      if (onLogin) onLogin(user, authToken);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/sub/auth/set-password`, { token, password });
      setSuccess('Password set! You can now log in with your email and new password.');
      setMode('login');
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  const cardStyle = {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#0a1530', padding: 20,
  };
  const formCard = {
    background: '#0f172a', borderRadius: 20, padding: '40px 36px',
    width: '100%', maxWidth: 440,
    border: '1px solid rgba(99,102,241,0.2)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  };
  const inp = {
    width: '100%', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '12px 16px', color: '#e2e8f0', fontSize: 15,
    outline: 'none', boxSizing: 'border-box', marginTop: 6,
  };
  const lbl = { fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 };
  const btn = {
    width: '100%', background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
    color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0',
    fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 24,
  };

  return (
    <div style={cardStyle}>
      <div style={formCard}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <CTSLogo size="lg" />
          <div style={{ marginTop: 16, fontSize: 13, color: '#6366f1', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
            Subcontractor Portal
          </div>
        </div>

        {success && (
          <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', color: '#10b981', marginBottom: 20, fontSize: 14 }}>
            ✅ {success}
          </div>
        )}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', color: '#ef4444', marginBottom: 20, fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <h2 style={{ color: '#fff', fontSize: 22, marginBottom: 24, textAlign: 'center' }}>Sign In to Your Portal</h2>
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>Email Address</label>
              <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Password</label>
              <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button style={btn} type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
              Access is restricted to approved CTS BPO subcontractors only.
            </p>
          </form>
        )}

        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword}>
            <h2 style={{ color: '#fff', fontSize: 22, marginBottom: 8, textAlign: 'center' }}>Set Your Portal Password</h2>
            <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
              Choose a strong password of at least 8 characters.
            </p>
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>New Password</label>
              <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required autoFocus />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Confirm Password</label>
              <input style={inp} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" required />
            </div>
            <button style={btn} type="submit" disabled={loading}>
              {loading ? 'Setting...' : 'Set Password & Continue'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Link to="/" style={{ color: '#6366f1', fontSize: 13, textDecoration: 'none' }}>← Back to CTS BPO</Link>
        </div>
      </div>
    </div>
  );
}

export default SubcontractorLogin;
