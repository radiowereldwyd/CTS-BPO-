import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '';

function ProfitProjection({ token }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchMetrics() {
    try {
      const res = await axios.get(`${API_BASE}/api/metrics`, { headers: authHeaders });
      setMetrics(res.data);
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }

  const m = metrics || {};
  const hasRevenue = (m.totalRevZar > 0) || (m.monthlyRevZar > 0);

  return (
    <div className="pp-page">
      <div className="pp-header">
        <h1>Revenue & Earnings Overview</h1>
        <p>Professional BPO Worldwide — Live from database</p>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Loading revenue data...</div>
        </div>
      )}

      {!loading && !hasRevenue && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
          <h3 style={{ color: '#e2e8f0', marginBottom: 12 }}>No revenue yet</h3>
          <p style={{ color: '#64748b', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
            Earnings will appear here automatically as contracts are completed and payments are processed. The AI agent is actively searching for clients — check the <strong style={{ color: '#818cf8' }}>AI Agent</strong> tab to see live outreach activity.
          </p>
        </div>
      )}

      {!loading && hasRevenue && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginTop: 24 }}>

          <div className="glow-card tile">
            <div className="tile-accent accent-blue" />
            <div className="tile-title">Total Revenue (All-Time)</div>
            <div className="tile-value">
              R {Number(m.totalRevZar || 0).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}
            </div>
            <div className="tile-sub">Payments received to date</div>
          </div>

          <div className="glow-card tile">
            <div className="tile-accent accent-green" />
            <div className="tile-title">This Month</div>
            <div className="tile-value" style={{ color: 'var(--green)' }}>
              R {Number(m.monthlyRevZar || 0).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}
            </div>
            <div className="tile-sub">Revenue in current month</div>
          </div>

          <div className="glow-card tile">
            <div className="tile-accent accent-amber" />
            <div className="tile-title">Contracts Completed</div>
            <div className="tile-value" style={{ color: 'var(--amber)' }}>
              {m.totalCompleted ?? 0}
            </div>
            <div className="tile-sub">All completed to date</div>
          </div>

          <div className="glow-card tile">
            <div className="tile-accent accent-blue" />
            <div className="tile-title">Success Rate</div>
            <div className="tile-value" style={{ color: 'var(--green)' }}>
              {m.totalCompleted > 0 ? `${m.successRate}%` : '—'}
            </div>
            <div className="tile-sub">{m.totalCompleted > 0 ? `Based on ${m.totalCompleted} contracts` : 'No completed contracts yet'}</div>
          </div>

        </div>
      )}
    </div>
  );
}

export default ProfitProjection;
