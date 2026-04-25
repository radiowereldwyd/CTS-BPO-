import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer
} from 'recharts';

const regionData = [
  { region: 'N. America', usd: 6000,  zar: 114000 },
  { region: 'Europe',     usd: 4500,  zar: 85000  },
  { region: 'Asia',       usd: 2500,  zar: 47500  },
  { region: 'Australia',  usd: 1800,  zar: 34200  },
  { region: 'Africa',     usd: 700,   zar: 13200  },
  { region: 'Total',      usd: 15500, zar: 300000 },
];

const summary = [
  { region: 'North America', usd: '$6.0k',  zar: 'R114k' },
  { region: 'Europe',        usd: '$4.5k',  zar: 'R85k'  },
  { region: 'Asia',          usd: '$2.5k',  zar: 'R47.5k'},
  { region: 'Australia',     usd: '$1.8k',  zar: 'R34.2k'},
  { region: 'Africa',        usd: '$700',   zar: 'R13.2k'},
  { region: 'Total Global',  usd: '$15.5k', zar: 'R300k+'},
];

const tooltipStyle = {
  background: '#0f1e3d',
  border: '1px solid rgba(0,200,255,0.2)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
};

function ProfitProjection() {
  return (
    <div className="pp-page">
      <div className="pp-header">
        <h1>Global Profit Projection: Daily Earnings Breakdown</h1>
        <p>AI-Driven BPO Worldwide</p>
      </div>

      <div className="pp-chart-card">
        <div className="pp-chart-title">Daily Earnings by Region</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={regionData}
            margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="region"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="usd"
              orientation="left"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="zar"
              orientation="right"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `R${(v/1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, name) =>
                name === 'usd'
                  ? [`$${(v/1000).toFixed(1)}k`, 'USD Earnings']
                  : [`R${(v/1000).toFixed(1)}k`, 'ZAR Earnings']
              }
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}
              formatter={v => v === 'usd' ? 'USD Earnings' : 'ZAR Earnings'}
            />
            <Bar yAxisId="usd" dataKey="usd" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar yAxisId="zar" dataKey="zar" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>

        <div className="pp-legend">
          <span className="legend-label"><span className="legend-dot" style={{ background: '#3b82f6' }} /> USD Earnings</span>
          <span className="legend-label"><span className="legend-dot" style={{ background: '#22c55e' }} /> ZAR Earnings</span>
        </div>
      </div>

      <div className="pp-summary">
        {summary.map((s, i) => (
          <div key={i} className="pp-summary-card">
            <div className="pp-region">{s.region}</div>
            <div className="pp-usd">{s.usd}</div>
            <div className="pp-zar">{s.zar}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProfitProjection;
