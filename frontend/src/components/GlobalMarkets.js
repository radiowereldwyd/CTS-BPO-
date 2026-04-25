import React from 'react';

const regions = [
  {
    name: 'North America',
    label: 'High Opportunity',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.15)',
    border: 'rgba(59,130,246,0.4)',
    emoji: '🌎',
  },
  {
    name: 'Europe',
    label: 'Key Market',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.4)',
    emoji: '🌍',
  },
  {
    name: 'Asia',
    label: 'Growth Potential',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.4)',
    emoji: '🌏',
  },
  {
    name: 'Africa',
    label: 'Emerging Clients',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.15)',
    border: 'rgba(251,191,36,0.4)',
    emoji: '🌍',
  },
  {
    name: 'Australia',
    label: 'Strategic Region',
    color: '#14b8a6',
    bg: 'rgba(20,184,166,0.15)',
    border: 'rgba(20,184,166,0.4)',
    emoji: '🌏',
  },
];

const legend = [
  { label: 'High Opportunity',  color: '#3b82f6' },
  { label: 'Key Market',        color: '#22c55e' },
  { label: 'Growth Potential',  color: '#f59e0b' },
  { label: 'Emerging Clients',  color: '#fbbf24' },
  { label: 'Strategic Region',  color: '#14b8a6' },
];

/*
  Simplified illustrative SVG world map.
  Continents are represented as stylised rounded shapes coloured by region.
*/
function WorldMapSVG() {
  return (
    <svg
      viewBox="0 0 900 440"
      className="gm-svg"
      aria-label="Stylised world map showing CTS BPO global regions"
    >
      {/* Ocean background */}
      <rect width="900" height="440" fill="rgba(0,200,255,0.04)" rx="12" />

      {/* Grid lines */}
      {[110, 220, 330].map(y => (
        <line key={y} x1="0" y1={y} x2="900" y2={y} stroke="rgba(0,200,255,0.06)" strokeWidth="1" />
      ))}
      {[180, 360, 540, 720].map(x => (
        <line key={x} x1={x} y1="0" x2={x} y2="440" stroke="rgba(0,200,255,0.06)" strokeWidth="1" />
      ))}

      {/* North America */}
      <path
        d="M 80 60 L 220 50 L 240 80 L 230 160 L 200 190 L 160 200 L 120 180 L 80 140 Z"
        fill="#1e3a8a"
        stroke="#3b82f6"
        strokeWidth="2"
        opacity="0.85"
      />
      <text x="155" y="130" textAnchor="middle" fill="#93c5fd" fontSize="11" fontWeight="700">N. AMERICA</text>

      {/* South America */}
      <path
        d="M 160 215 L 210 210 L 225 260 L 220 330 L 195 360 L 165 350 L 145 300 L 148 250 Z"
        fill="#1a2e4a"
        stroke="#3b82f6"
        strokeWidth="1.5"
        opacity="0.7"
      />
      <text x="185" y="290" textAnchor="middle" fill="#93c5fd" fontSize="10">S. America</text>

      {/* Europe */}
      <path
        d="M 390 50 L 500 45 L 510 90 L 490 130 L 440 140 L 390 120 L 375 90 Z"
        fill="#14532d"
        stroke="#22c55e"
        strokeWidth="2"
        opacity="0.85"
      />
      <text x="442" y="95" textAnchor="middle" fill="#86efac" fontSize="11" fontWeight="700">EUROPE</text>

      {/* Africa */}
      <path
        d="M 400 155 L 490 150 L 510 200 L 510 300 L 470 370 L 430 380 L 390 340 L 375 270 L 380 200 Z"
        fill="#3a2a00"
        stroke="#fbbf24"
        strokeWidth="2"
        opacity="0.85"
      />
      <text x="443" y="270" textAnchor="middle" fill="#fcd34d" fontSize="11" fontWeight="700">AFRICA</text>

      {/* Asia */}
      <path
        d="M 520 40 L 750 35 L 760 100 L 730 160 L 660 180 L 580 170 L 530 140 L 510 90 Z"
        fill="#3a1f00"
        stroke="#f59e0b"
        strokeWidth="2"
        opacity="0.85"
      />
      <text x="635" y="108" textAnchor="middle" fill="#fcd34d" fontSize="11" fontWeight="700">ASIA</text>

      {/* Middle East (part of Asia cluster) */}
      <path
        d="M 520 145 L 580 140 L 590 200 L 560 230 L 510 215 L 505 175 Z"
        fill="#2a1500"
        stroke="#f59e0b"
        strokeWidth="1"
        opacity="0.65"
      />

      {/* Australia */}
      <path
        d="M 720 250 L 820 240 L 840 290 L 830 340 L 780 360 L 730 350 L 705 310 L 710 268 Z"
        fill="#063535"
        stroke="#14b8a6"
        strokeWidth="2"
        opacity="0.85"
      />
      <text x="773" y="305" textAnchor="middle" fill="#5eead4" fontSize="11" fontWeight="700">AUSTRALIA</text>

      {/* Decorative dots for client hotspots */}
      {[
        [155, 120, '#3b82f6'],
        [445, 90, '#22c55e'],
        [635, 100, '#f59e0b'],
        [443, 265, '#fbbf24'],
        [773, 298, '#14b8a6'],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r="5" fill={c} opacity="0.9">
          <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" begin={`${i * 0.4}s`} />
        </circle>
      ))}
    </svg>
  );
}

function GlobalMarkets() {
  return (
    <div className="gm-page">
      <div className="gm-header">
        <h1>Global Expansion Opportunities for CTS BPO</h1>
        <p>AI-Driven BPO Reach Worldwide</p>
      </div>

      <div className="gm-map-container">
        <WorldMapSVG />
      </div>

      <div className="gm-regions">
        {regions.map((r, i) => (
          <div key={i} className="gm-region-card">
            <div className="gm-region-name">{r.emoji} {r.name}</div>
            <span
              className="gm-badge"
              style={{ background: r.bg, color: r.color, border: `1px solid ${r.border}` }}
            >
              {r.label}
            </span>
          </div>
        ))}
      </div>

      <div className="gm-legend">
        {legend.map((l, i) => (
          <div key={i} className="gm-legend-item">
            <span className="gm-legend-dot" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default GlobalMarkets;
