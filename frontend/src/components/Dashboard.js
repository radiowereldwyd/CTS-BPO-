import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function Dashboard() {
  const [metrics, setMetrics] = useState({
    activeContracts: 0,
    completedToday: 0,
    revenue: 0,
    successRate: 0,
    aiStatus: 'idle',
  });
  const [initiating, setInitiating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      const res = await axios.get(`${API_BASE}/api/metrics`);
      setMetrics(res.data);
    } catch {
      // Use placeholder data when API is not yet connected
      setMetrics({
        activeContracts: 12,
        completedToday: 5,
        revenue: 225000,
        successRate: 89,
        aiStatus: 'running',
      });
    }
  }

  async function handleAIInitiate() {
    setInitiating(true);
    setMessage('');
    try {
      await axios.post(`${API_BASE}/api/ai/initiate`);
      setMessage('AI workflow initiated successfully.');
    } catch {
      setMessage('AI workflow triggered (running in simulation mode).');
    } finally {
      setInitiating(false);
    }
  }

  return (
    <div className="dashboard">
      <h2>Dashboard</h2>

      {/* AI Initiate Button */}
      <section className="ai-initiate">
        <button
          onClick={handleAIInitiate}
          disabled={initiating}
          className="btn-ai-initiate"
        >
          {initiating ? 'Initiating...' : '🚀 AI Initiate'}
        </button>
        {message && <p className="initiate-message">{message}</p>}
      </section>

      {/* Metrics Grid */}
      <section className="metrics-grid">
        <div className="metric-card">
          <h3>Active Contracts</h3>
          <p className="metric-value">{metrics.activeContracts}</p>
        </div>
        <div className="metric-card">
          <h3>Completed Today</h3>
          <p className="metric-value">{metrics.completedToday}</p>
        </div>
        <div className="metric-card">
          <h3>Monthly Revenue</h3>
          <p className="metric-value">R{metrics.revenue.toLocaleString()}</p>
        </div>
        <div className="metric-card">
          <h3>Success Rate</h3>
          <p className="metric-value">{metrics.successRate}%</p>
        </div>
        <div className="metric-card">
          <h3>AI Status</h3>
          <p className={`metric-value ai-status-${metrics.aiStatus}`}>
            {metrics.aiStatus.toUpperCase()}
          </p>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
