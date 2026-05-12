import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '';

function StatusPanel({ token }) {
  const [statuses, setStatuses]       = useState([]);
  const [googleApis, setGoogleApis]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [gcLoading, setGcLoading]     = useState(true);
  const [error, setError]             = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchAll() {
    await Promise.all([fetchStatuses(), fetchGoogleStatus()]);
    setLastRefresh(new Date());
  }

  async function fetchStatuses() {
    try {
      const res = await axios.get(`${API_BASE}/api/status`, { headers: authHeaders });
      setStatuses(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError('Unable to reach the server. Retrying...');
    } finally {
      setLoading(false);
    }
  }

  async function fetchGoogleStatus() {
    try {
      const res = await axios.get(`${API_BASE}/api/google-cloud/status`, { headers: authHeaders });
      setGoogleApis(res.data);
    } catch {
      setGoogleApis(null);
    } finally {
      setGcLoading(false);
    }
  }

  function statusBadge(status) {
    const map = {
      running:  { cls: 'badge-running', label: 'RUNNING' },
      ok:       { cls: 'badge-running', label: 'OK' },
      idle:     { cls: 'badge-idle',    label: 'IDLE' },
      disabled: { cls: 'badge-idle',    label: 'DISABLED' },
      error:    { cls: 'badge-error',   label: 'ERROR' },
      offline:  { cls: 'badge-error',   label: 'OFFLINE' },
    };
    const b = map[status?.toLowerCase()] || map.idle;
    return <span className={`status-badge ${b.cls}`}>{b.label}</span>;
  }

  function gcApiIcon(status) {
    if (status === 'ok')       return { icon: '✅', color: '#10b981' };
    if (status === 'disabled') return { icon: '⚠️', color: '#f59e0b' };
    return { icon: '❌', color: '#ef4444' };
  }

  return (
    <div className="status-panel">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Live Status Panel</h2>
          <p className="page-subtitle">Real-time status of all AI modules and Google Cloud APIs</p>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>
          {lastRefresh && <div>Last updated: {lastRefresh.toLocaleTimeString()}</div>}
          <div style={{ marginTop: 4, color: '#6366f1', cursor: 'pointer', fontWeight: 600 }} onClick={fetchAll}>↻ Refresh now</div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Loading live status...</div>
        </div>
      )}

      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '20px 24px', color: '#ef4444', marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && statuses.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>AI Modules</h3>
          <div className="table-wrapper" style={{ marginBottom: 32 }}>
            <table className="status-table">
              <thead>
                <tr>
                  <th>AI Module</th>
                  <th>Status</th>
                  <th>Last Action</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((s) => (
                  <tr key={s.module}>
                    <td className="module-name">{s.module}</td>
                    <td>{statusBadge(s.status)}</td>
                    <td>{s.lastAction || '—'}</td>
                    <td className="timestamp">{s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Google Cloud API Status ─────────────────────────────────────── */}
      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
        Google Cloud APIs
        {googleApis && (
          <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            Project: <strong>{googleApis.project}</strong> &nbsp;·&nbsp;
            <span style={{ color: '#10b981' }}>{googleApis.summary?.ok} OK</span>
            {googleApis.summary?.disabled > 0 && <span style={{ color: '#f59e0b' }}> · {googleApis.summary.disabled} disabled</span>}
            {googleApis.summary?.error > 0 && <span style={{ color: '#ef4444' }}> · {googleApis.summary.error} error</span>}
          </span>
        )}
      </h3>

      {gcLoading && (
        <div style={{ color: '#94a3b8', fontSize: 14, padding: '12px 0' }}>Checking Google Cloud APIs...</div>
      )}

      {!gcLoading && googleApis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginBottom: 32 }}>
          {googleApis.apis.map((api) => {
            const { icon, color } = gcApiIcon(api.status);
            return (
              <div key={api.api} style={{
                background: '#fff',
                border: `1px solid ${api.status === 'ok' ? '#d1fae5' : api.status === 'disabled' ? '#fef3c7' : '#fee2e2'}`,
                borderRadius: 10,
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                    {icon} {api.api}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: api.status === 'ok' ? '#d1fae5' : api.status === 'disabled' ? '#fef3c7' : '#fee2e2',
                    color,
                  }}>
                    {api.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#475569' }}>{api.message}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Auth: {api.authMethod?.replace('_', ' ')}</div>
                {api.enableUrl && (
                  <a
                    href={api.enableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginTop: 4, fontSize: 12, fontWeight: 600,
                      color: '#6366f1', textDecoration: 'none',
                      background: '#eef2ff', padding: '4px 10px', borderRadius: 6, display: 'inline-block',
                    }}
                  >
                    → Enable in Google Cloud Console
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!gcLoading && !googleApis && (
        <div style={{ color: '#94a3b8', fontSize: 14, padding: '12px 0' }}>
          Could not load Google Cloud API status.
        </div>
      )}

      {/* ── Instructions for disabled APIs ─────────────────────────────── */}
      {!gcLoading && googleApis && googleApis.apis.some(a => a.status !== 'ok') && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '18px 22px', marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 10 }}>
            Action required — some APIs need to be enabled
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#78350f', lineHeight: 1.8 }}>
            {googleApis.apis.filter(a => a.status === 'disabled' && a.enableUrl).map(a => (
              <li key={a.api}>
                <strong>{a.api}</strong> — <a href={a.enableUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>click here to enable it</a>
              </li>
            ))}
            {!process.env.REACT_APP_HAS_CSE_ID && googleApis.apis.find(a => a.api === 'Custom Search (CSE)' && a.status === 'disabled') && (
              <li>
                <strong>GOOGLE_CSE_ID</strong> — go to{' '}
                <a href="https://cse.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1' }}>cse.google.com</a>,
                create a new search engine, copy the ID, then add it as a secret named <code>GOOGLE_CSE_ID</code>
              </li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}

export default StatusPanel;
