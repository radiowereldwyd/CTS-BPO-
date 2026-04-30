import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '';

function StatusPanel({ token }) {
  const [statuses, setStatuses]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchStatuses() {
    try {
      const res = await axios.get(`${API_BASE}/api/status`, { headers: authHeaders });
      setStatuses(Array.isArray(res.data) ? res.data : []);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError('Unable to reach the server. Retrying...');
    } finally {
      setLoading(false);
    }
  }

  function statusBadge(status) {
    const map = {
      running: { cls: 'badge-running', label: 'RUNNING' },
      idle:    { cls: 'badge-idle',    label: 'IDLE' },
      error:   { cls: 'badge-error',   label: 'ERROR' },
      offline: { cls: 'badge-error',   label: 'OFFLINE' },
    };
    const b = map[status?.toLowerCase()] || map.idle;
    return <span className={`status-badge ${b.cls}`}>{b.label}</span>;
  }

  return (
    <div className="status-panel">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Live Status Panel</h2>
          <p className="page-subtitle">Real-time status of all AI modules — data pulled live from the server</p>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>
          {lastRefresh && <div>Last updated: {lastRefresh.toLocaleTimeString()}</div>}
          <div style={{ marginTop: 4, color: '#6366f1', cursor: 'pointer', fontWeight: 600 }} onClick={fetchStatuses}>↻ Refresh now</div>
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

      {!loading && !error && statuses.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
          <div>No module status data available yet.</div>
        </div>
      )}

      {!loading && statuses.length > 0 && (
        <div className="table-wrapper">
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
      )}
    </div>
  );
}

export default StatusPanel;
