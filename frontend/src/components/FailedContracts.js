import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '';

function FailedContracts({ token }) {
  const [failures, setFailures] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetchFailures();
    const interval = setInterval(fetchFailures, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchFailures() {
    try {
      const res = await axios.get(`${API_BASE}/api/contracts/failed`, { headers: authHeaders });
      setFailures(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError('Could not load failed contracts. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  function statusBadge(status) {
    const map    = { failed: 'badge-error', in_recovery: 'badge-idle', resolved: 'badge-running' };
    const labels = { failed: '🔴 Failed',   in_recovery: '🟡 In Recovery', resolved: '🟢 Resolved' };
    return <span className={`status-badge ${map[status] || ''}`}>{labels[status] || status}</span>;
  }

  return (
    <div className="failed-contracts">
      <div className="page-header">
        <h2>Failed Contracts</h2>
        <p className="page-subtitle">Contracts requiring attention or recovery action — live from database</p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Loading...</div>
        </div>
      )}

      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '20px 24px', color: '#ef4444' }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && failures.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">✅</span>
          <p>No failed contracts. All systems operating normally.</p>
        </div>
      )}

      {!loading && !error && failures.length > 0 && (
        <div className="table-wrapper">
          <table className="failures-table">
            <thead>
              <tr>
                <th>Contract ID</th>
                <th>Client</th>
                <th>Failure Reason</th>
                <th>Assigned To</th>
                <th>Failed At</th>
                <th>Recovery Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={f.id}>
                  <td className="contract-id">{f.contractId || `#${f.id}`}</td>
                  <td>{f.clientName || '—'}</td>
                  <td>{f.failureReason || '—'}</td>
                  <td>{f.assignedTo || '—'}</td>
                  <td className="timestamp">{f.failedAt ? new Date(f.failedAt).toLocaleString() : '—'}</td>
                  <td>{f.recoveryAction || '—'}</td>
                  <td>{statusBadge(f.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default FailedContracts;
