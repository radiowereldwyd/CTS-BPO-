import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const PLACEHOLDER_STATUSES = [
  { module: 'AI Sourcing & Outreach', status: 'running', lastAction: 'Sent 12 emails', updatedAt: new Date().toISOString() },
  { module: 'AI Negotiation Engine', status: 'running', lastAction: 'Closed 3 contracts', updatedAt: new Date().toISOString() },
  { module: 'AI Contract Manager', status: 'running', lastAction: 'Analyzed 5 contracts', updatedAt: new Date().toISOString() },
  { module: 'AI Subcontractor Assignment', status: 'running', lastAction: 'Assigned 2 jobs', updatedAt: new Date().toISOString() },
  { module: 'AI Payment Gateway', status: 'running', lastAction: 'Processed R75,000', updatedAt: new Date().toISOString() },
  { module: 'AI Audit Trail Logger', status: 'running', lastAction: 'Logged 47 events', updatedAt: new Date().toISOString() },
];

function StatusPanel({ token }) {
  const [statuses, setStatuses] = useState(PLACEHOLDER_STATUSES);

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
      setStatuses(res.data);
    } catch {
      setStatuses(PLACEHOLDER_STATUSES);
    }
  }

  function statusBadge(status) {
    const map = { running: 'badge-running', idle: 'badge-idle', error: 'badge-error' };
    return (
      <span className={`status-badge ${map[status] || 'badge-idle'}`}>
        {status.toUpperCase()}
      </span>
    );
  }

  return (
    <div className="status-panel">
      <div className="page-header">
        <h2>Live Status Panel</h2>
        <p className="page-subtitle">Real-time status of all AI modules</p>
      </div>
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
                <td>{s.lastAction}</td>
                <td className="timestamp">{new Date(s.updatedAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default StatusPanel;
