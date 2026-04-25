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

function StatusPanel() {
  const [statuses, setStatuses] = useState(PLACEHOLDER_STATUSES);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 15000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatuses() {
    try {
      const res = await axios.get(`${API_BASE}/api/status`);
      setStatuses(res.data);
    } catch {
      setStatuses(PLACEHOLDER_STATUSES);
    }
  }

  function statusBadge(status) {
    const colors = { running: '#22c55e', idle: '#f59e0b', error: '#ef4444' };
    return (
      <span
        style={{
          background: colors[status] || '#6b7280',
          color: '#fff',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {status.toUpperCase()}
      </span>
    );
  }

  return (
    <div className="status-panel">
      <h2>Live Status Panel</h2>
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
              <td>{s.module}</td>
              <td>{statusBadge(s.status)}</td>
              <td>{s.lastAction}</td>
              <td>{new Date(s.updatedAt).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default StatusPanel;
