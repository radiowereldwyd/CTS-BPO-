import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CTSLogo from './CTSLogo';

const API_BASE = '';

function LoginPage({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);

  // ── Barcode / token login via URL fragment ──────────────────────────────────
  // When the backend redirects to /operations#token=…&user=… after a barcode
  // scan, this effect fires on the /login page too (before the redirect lands).
  // More importantly, the backend can also redirect to /login#token=…&user=…
  // so we handle it here as well.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.slice(1)); // strip leading '#'
    const jwtToken = params.get('token');
    const userJson = params.get('user');

    if (jwtToken && userJson) {
      try {
        const user = JSON.parse(decodeURIComponent(userJson));
        localStorage.setItem('cts_token', jwtToken);
        localStorage.setItem('cts_user', JSON.stringify(user));
        // Clear the fragment so it doesn't linger in history
        window.history.replaceState(null, '', window.location.pathname);
        if (onLogin) onLogin(user, jwtToken);
      } catch {
        setError('Barcode login failed — invalid token data in URL.');
      }
    }
  }, [onLogin]);

  // ── Password login ──────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
      const { token, user } = res.data;
      localStorage.setItem('cts_token', token);
      localStorage.setItem('cts_user', JSON.stringify(user));
      if (onLogin) onLogin(user, token);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  // ── Token login (manual token entry / API call) ─────────────────────────────
  async function handleTokenLogin(tokenValue) {
    if (!tokenValue) return;
    setError('');
    setTokenLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/login`, {
        params: { token: tokenValue },
        headers: { Accept: 'application/json' },
      });
      const { token, user } = res.data;
      localStorage.setItem('cts_token', token);
      localStorage.setItem('cts_user', JSON.stringify(user));
      if (onLogin) onLogin(user, token);
    } catch (err) {
      setError(err.response?.data?.error || 'Token login failed.');
    } finally {
      setTokenLoading(false);
    }
  }

  // Check for ?token= in the query string (direct barcode scan link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qToken = params.get('token');
    if (qToken) {
      handleTokenLogin(qToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <CTSLogo size="lg" />
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>Sign In</h2>

          {error && <div className="login-error">{error}</div>}

          {(loading || tokenLoading) && (
            <div style={{ textAlign: 'center', color: '#00c8ff', marginBottom: 12, fontSize: 13 }}>
              {tokenLoading ? '🔑 Validating barcode token…' : 'Signing in…'}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ctsbpo.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn-login" disabled={loading || tokenLoading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="login-hint" style={{ color: '#475569', fontSize: 12, marginTop: 16 }}>
            Admin access only. Unauthorised access is prohibited.
          </p>

          <div style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
          }}>
            <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>
              🔲 Scan your admin barcode to login instantly
            </p>
            <p style={{ color: '#475569', fontSize: 11 }}>
              Once logged in, visit{' '}
              <a
                href="/admin/barcode"
                style={{ color: '#00c8ff', textDecoration: 'none' }}
                onClick={(e) => {
                  // Only navigate if already authenticated (shouldn't happen here,
                  // but guard anyway)
                  const t = localStorage.getItem('cts_token');
                  if (!t) { e.preventDefault(); setError('Log in first to access the barcode page.'); }
                }}
              >
                /admin/barcode
              </a>{' '}
              to view your QR code.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
