import React from 'react';

const bands = [
  {
    icon: '💻',
    title: 'DEV ENVIRONMENT SETUP',
    color: '#0f4c4c',
    border: '#14b8a6',
    glow: 'rgba(20,184,166,0.15)',
    items: ['Code Setup & Local Server', 'Database Initialization', 'AI Engine Testing', 'Frontend Preview'],
  },
  {
    icon: '📤',
    title: 'COMMIT & PUSH TO GIT',
    color: '#0f3a1c',
    border: '#22c55e',
    glow: 'rgba(34,197,94,0.15)',
    items: ['Commit Changes', 'Push to Repo (main)'],
  },
  {
    icon: '⚙️',
    title: 'CI/CD PIPELINE (STAGING)',
    color: '#3a2200',
    border: '#f59e0b',
    glow: 'rgba(245,158,11,0.15)',
    items: ['Automated Build', 'Run Tests', 'Deploy to Staging Server'],
  },
  {
    icon: '🔍',
    title: 'VALIDATE IN STAGING',
    color: '#063535',
    border: '#2dd4bf',
    glow: 'rgba(45,212,191,0.15)',
    items: ['Test Functionality', 'Check AI Reports', 'Review Dashboard'],
  },
  {
    icon: '✅',
    title: 'APPROVAL & REVIEW',
    color: '#1a1a2e',
    border: '#64748b',
    glow: 'rgba(100,116,139,0.12)',
    items: ['Team Review', 'Performance Sign-Off'],
  },
  {
    icon: '🚀',
    title: 'DEPLOY TO PRODUCTION',
    color: '#1e0a3c',
    border: '#a855f7',
    glow: 'rgba(168,85,247,0.15)',
    items: ['Tag Release', 'Deploy to Live Server', 'Monitor Deployment'],
  },
  {
    icon: '📊',
    title: 'LIVE MONITORING & REPORTS',
    color: '#3a0a0a',
    border: '#ef4444',
    glow: 'rgba(239,68,68,0.15)',
    items: ['Track Live Metrics', 'AI Optimization Logs', 'Daily Profit Reports'],
  },
];

function DeploymentGuide() {
  return (
    <div className="deploy-page">
      <div className="deploy-header">
        <h1>CTS BPO Deployment Guide</h1>
        <p>From Development to Production</p>
      </div>

      <div className="deploy-bands">
        {bands.map((band, i) => (
          <div
            key={i}
            className="deploy-band"
            style={{
              background: `linear-gradient(135deg, ${band.color} 0%, #0a1530 100%)`,
              borderColor: band.border,
              boxShadow: `0 0 20px ${band.glow}`,
            }}
          >
            <div className="deploy-band-icon">{band.icon}</div>
            <div className="deploy-band-content">
              <div className="deploy-band-title" style={{ color: band.border }}>
                {band.title}
              </div>
              <ul className="deploy-band-list">
                {band.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: band.border, opacity: 0.4, flexShrink: 0, alignSelf: 'center' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DeploymentGuide;
