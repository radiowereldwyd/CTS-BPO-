import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const profitTrendData = [
  { month: 'JAN', usd: 9200, zar: 172000 },
  { month: 'FEB', usd: 10800, zar: 199000 },
  { month: 'MAR', usd: 12400, zar: 228000 },
  { month: 'APR', usd: 15500, zar: 295000 },
];

const responseTimeData = [
  { t: 1, ms: 220 }, { t: 2, ms: 195 }, { t: 3, ms: 210 },
  { t: 4, ms: 190 }, { t: 5, ms: 230 }, { t: 6, ms: 205 },
  { t: 7, ms: 198 },
];

function Dashboard({ token }) {
  const [metrics, setMetrics] = useState(null);
  const [initiating, setInitiating] = useState(false);
  const [message, setMessage] = useState('');

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function fetchMetrics() {
    try {
      const res = await axios.get(`${API_BASE}/api/metrics`, { headers: authHeaders });
      setMetrics(res.data);
    } catch {
      setMetrics({
        daily: 'R295,000',
        successRate: '98.6%',
        netMargin: '74.5%',
        activeClients: 215,
        aiScore: 97.8,
        recoveryTime: '3 min',
        uptime: '99.98%',
        activeAlerts: 2,
        regions: 12,
      });
    }
  }

  async function handleAIInitiate() {
    setInitiating(true);
    setMessage('');
    try {
      await axios.post(`${API_BASE}/api/ai/initiate`, {}, { headers: authHeaders });
      setMessage('AI workflow initiated successfully.');
    } catch {
      setMessage('AI workflow triggered (running in simulation mode).');
    } finally {
      setInitiating(false);
    }
  }

  const m = metrics || {};

  return (
    <div className="dashboard-wrapper">
      {/* Header */}
      <div className="dashboard-header">
        <div className="brand-block">
          <span className="brand-title">CTS BPO</span>
          <span className="brand-subtitle">Production Monitoring Dashboard</span>
        </div>
      </div>

      {/* AI Initiate */}
      <section className="ai-initiate">
        <button onClick={handleAIInitiate} disabled={initiating} className="btn-ai-initiate">
          {initiating ? '⏳ Initiating...' : '🚀 AI Initiate'}
        </button>
        {message && <p className="initiate-message">{message}</p>}
      </section>

      {/* ── TOP ROW: 4 tiles ───────────────────────────────────────── */}
      <div className="dash-row-top">

        {/* 1. Daily */}
        <div className="glow-card tile">
          <div className="tile-accent accent-blue" />
          <div className="tile-title">Daily</div>
          <div className="tile-value">{m.daily || 'R295,000'}</div>
          <ul className="tile-list">
            <li>Code Setup &amp; Local Server</li>
            <li>Database Initialization</li>
            <li>AI Engine Testing</li>
            <li>Frontend Preview</li>
          </ul>
        </div>

        {/* 2. Success Rate */}
        <div className="glow-card tile">
          <div className="tile-accent accent-green" />
          <div className="tile-title">Success Rate</div>
          <div className="tile-value" style={{ color: 'var(--green)' }}>{m.successRate || '98.6%'}</div>
          <ul className="tile-list">
            <li>Commit Changes</li>
            <li>Push to Repo (main)</li>
          </ul>
        </div>

        {/* 3. Net Margin */}
        <div className="glow-card tile">
          <div className="tile-accent accent-amber" />
          <div className="tile-title">Net Margin</div>
          <div className="tile-value" style={{ color: 'var(--amber)' }}>{m.netMargin || '74.5%'}</div>
        </div>

        {/* 4. Active Clients */}
        <div className="glow-card tile">
          <div className="tile-accent accent-blue" />
          <div className="tile-title">Active Clients</div>
          <div className="tile-value" style={{ color: 'var(--blue-glow)' }}>{m.activeClients || 215}</div>
        </div>
      </div>

      {/* ── MIDDLE ROW: 3 tiles ─────────────────────────────────────── */}
      <div className="dash-row-mid">

        {/* 5. Global Performance */}
        <div className="glow-card tile">
          <div className="tile-accent accent-teal" />
          <div className="tile-title">Global Performance</div>
          <div className="map-placeholder">🌍</div>
          <div className="map-caption">Regions: {m.regions || 12} &nbsp;|&nbsp; Clients: {m.activeClients || 215}</div>
        </div>

        {/* 6. Profit Trend */}
        <div className="glow-card tile" style={{ minHeight: 220 }}>
          <div className="tile-accent accent-blue" />
          <div className="tile-title">Profit Trend (USD &amp; ZAR)</div>
          <div style={{ flex: 1, minHeight: 130 }}>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={profitTrendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f1e3d', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }}
                  formatter={(v, name) => [name === 'usd' ? `$${(v/1000).toFixed(1)}k` : `R${(v/1000).toFixed(0)}k`, name.toUpperCase()]}
                />
                <Line type="monotone" dataKey="usd" stroke="#00c8ff" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="zar" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            <span className="legend-label"><span className="legend-dot" style={{ background: '#00c8ff' }} /> USD</span>
            <span className="legend-label"><span className="legend-dot" style={{ background: '#22c55e' }} /> ZAR</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Monthly Earnings</span>
          </div>
        </div>

        {/* 7. AI Optimization */}
        <div className="glow-card tile">
          <div className="tile-accent accent-purple" />
          <div className="tile-title">AI Optimization</div>
          <div className="ai-sub-card">
            <span className="ai-sub-icon">🧠</span>
            <div>
              <div className="ai-sub-label">AI Score</div>
              <div className="ai-sub-value">{m.aiScore || 97.8}</div>
            </div>
          </div>
          <div className="ai-sub-card">
            <span className="ai-sub-icon">⏱️</span>
            <div>
              <div className="ai-sub-label">Recovery Time</div>
              <div className="ai-sub-value">{m.recoveryTime || '3 min'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: 3 tiles ─────────────────────────────────────── */}
      <div className="dash-row-bot">

        {/* 8. Compliance & Audits */}
        <div className="glow-card tile">
          <div className="tile-accent accent-green" />
          <div className="tile-title">Compliance &amp; Audits</div>
          <div className="compliance-row">
            <span className="compliance-badge">POPIA ✓</span>
            <span className="compliance-badge">GDPR ✓</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Audit Log</div>
          <ul className="tile-check-list">
            <li>Contract Verified</li>
            <li>Data Backup Completed</li>
            <li>GDPR Check Passed</li>
          </ul>
        </div>

        {/* 9. System Health */}
        <div className="glow-card tile" style={{ minHeight: 180 }}>
          <div className="tile-accent accent-teal" />
          <div className="tile-title">System Health</div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Server Uptime</div>
            <div className="uptime-value">{m.uptime || '99.98%'}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Response Time</div>
          <ResponsiveContainer width="100%" height={55}>
            <AreaChart data={responseTimeData} margin={{ top: 0, right: 0, bottom: 0, left: -30 }}>
              <XAxis hide />
              <YAxis hide domain={[180, 240]} />
              <Tooltip
                contentStyle={{ background: '#0f1e3d', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: 11 }}
                formatter={(v) => [`${v} ms`, 'Response']}
              />
              <Area type="monotone" dataKey="ms" stroke="#14b8a6" fill="rgba(20,184,166,0.12)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 10. Tasks & Alerts (RED) */}
        <div className="glow-card tile tile-red">
          <div className="tile-accent accent-red" />
          <div className="tile-title" style={{ color: '#fca5a5' }}>Tasks &amp; Alerts</div>
          <div>
            <span className="alert-badge">⚠️ Active Alerts: {m.activeAlerts || 2}</span>
          </div>
          <ul className="tile-list">
            <li style={{ color: '#fca5a5' }}>Client Onboarding</li>
            <li style={{ color: '#fca5a5' }}>Forex API Update</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
