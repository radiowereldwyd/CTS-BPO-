import React from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';

const COLORS = {
  NA: '#3b82f6',
  EU: '#22c55e',
  AS: '#f59e0b',
  AF: '#eab308',
  OC: '#14b8a6',
};

const NAME_TO_REGION = {};
[
  'United States of America', 'Canada', 'Mexico', 'Cuba', 'Jamaica',
  'Dominican Rep.', 'Haiti', 'Puerto Rico', 'Bahamas', 'Belize',
  'Costa Rica', 'El Salvador', 'Guatemala', 'Honduras', 'Nicaragua', 'Panama',
  'Trinidad and Tobago', 'Greenland',
].forEach(n => { NAME_TO_REGION[n] = 'NA'; });
[
  'Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium',
  'Bosnia and Herz.', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia',
  'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece',
  'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia',
  'Lithuania', 'Luxembourg', 'Macedonia', 'Malta', 'Moldova',
  'Montenegro', 'Netherlands', 'Norway', 'Poland', 'Portugal',
  'Romania', 'Russia', 'Serbia', 'Slovakia', 'Slovenia', 'Spain',
  'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom', 'N. Cyprus',
].forEach(n => { NAME_TO_REGION[n] = 'EU'; });
[
  'Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh',
  'Bhutan', 'Brunei', 'Cambodia', 'China', 'Georgia', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Israel', 'Japan', 'Jordan',
  'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon',
  'Malaysia', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea',
  'Oman', 'Pakistan', 'Palestine', 'Philippines', 'Qatar',
  'Saudi Arabia', 'Singapore', 'South Korea', 'Sri Lanka', 'Syria',
  'Taiwan', 'Tajikistan', 'Thailand', 'Timor-Leste', 'Turkey',
  'Turkmenistan', 'United Arab Emirates', 'Uzbekistan', 'Vietnam',
  'Yemen',
].forEach(n => { NAME_TO_REGION[n] = 'AS'; });
[
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi',
  'Cameroon', 'Central African Rep.', 'Chad', 'Congo', 'Dem. Rep. Congo',
  'Djibouti', 'Egypt', 'Eq. Guinea', 'Eritrea', 'Ethiopia', 'Gabon',
  'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya',
  "Côte d'Ivoire", 'Lesotho', 'Liberia', 'Libya', 'Madagascar',
  'Malawi', 'Mali', 'Mauritania', 'Morocco', 'Mozambique', 'Namibia',
  'Niger', 'Nigeria', 'Rwanda', 'S. Sudan', 'Senegal', 'Sierra Leone',
  'Somalia', 'Somaliland', 'South Africa', 'Sudan', 'Tanzania',
  'Togo', 'Tunisia', 'Uganda', 'W. Sahara', 'Zambia', 'Zimbabwe',
  'eSwatini',
].forEach(n => { NAME_TO_REGION[n] = 'AF'; });
[
  'Australia', 'Fiji', 'New Caledonia', 'New Zealand', 'Papua New Guinea',
  'Solomon Is.', 'Vanuatu',
].forEach(n => { NAME_TO_REGION[n] = 'OC'; });

const MARKERS = [
  {
    name: 'North America',
    region: 'NA',
    coords: [-100, 40],
    label: 'High Opportunity',
    emoji: '🇺🇸',
    headline: 'Primary target market',
    description:
      'North American businesses pay in US Dollars, making each contract highly valuable. Small and medium-sized businesses in this region are heavy BPO users — a top priority for the AI outreach agent.',
  },
  {
    name: 'Europe',
    region: 'EU',
    coords: [15, 50],
    label: 'Key Market',
    emoji: '🇪🇺',
    headline: 'Stable, long-term contracts',
    description:
      'European companies tend to renew BPO contracts frequently and maintain longer relationships. Strong GDPR compliance focus makes professional platforms like CTS BPO attractive.',
  },
  {
    name: 'Asia',
    region: 'AS',
    coords: [100, 35],
    label: 'Growth Potential',
    emoji: '🌏',
    headline: 'High-volume growth region',
    description:
      'Massive small-business population with growing demand for outsourced services. The AI agent is actively targeting Asian markets as a high-priority expansion zone.',
  },
  {
    name: 'Africa',
    region: 'AF',
    coords: [20, 0],
    label: 'Home Market',
    emoji: '🌍',
    headline: 'CTS BPO home base',
    description:
      'South Africa is where CTS BPO is based. African clients are the foundation of the platform — understanding local business needs drives product quality across all regions.',
  },
  {
    name: 'Australia / Oceania',
    region: 'OC',
    coords: [135, -25],
    label: 'Strategic Region',
    emoji: '🇦🇺',
    headline: 'Premium-tier market',
    description:
      'Australian businesses tend to pay premium rates and value quality over cost. A strategic target for high-value contracts once the platform has established credibility.',
  },
];

const legend = [
  { label: 'High Opportunity',  color: COLORS.NA },
  { label: 'Key Market',        color: COLORS.EU },
  { label: 'Growth Potential',  color: COLORS.AS },
  { label: 'Home Market',       color: COLORS.AF },
  { label: 'Strategic Region',  color: COLORS.OC },
];

function WorldMap() {
  return (
    <div style={{ position: 'relative' }}>
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 153 }}
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography="/world-110m.json">
          {({ geographies }) =>
            geographies.map(geo => {
              const region = NAME_TO_REGION[geo.properties.name];
              const fill = region ? COLORS[region] : '#1e3a5f';
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#0a1530"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none', opacity: region ? 0.85 : 0.6 },
                    hover:   { outline: 'none', opacity: 1, filter: region ? 'brightness(1.2)' : 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
          }
        </Geographies>

        {MARKERS.map(m => (
          <Marker key={m.region} coordinates={m.coords}>
            <circle
              r={10}
              fill={COLORS[m.region]}
              stroke="#fff"
              strokeWidth={2}
              style={{ filter: `drop-shadow(0 0 6px ${COLORS[m.region]})` }}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              fontSize={9}
              fontWeight="700"
              style={{ pointerEvents: 'none' }}
            >
              {m.emoji.slice(0, 2)}
            </text>
          </Marker>
        ))}
      </ComposableMap>
    </div>
  );
}

function GlobalMarkets() {
  return (
    <div className="gm-page">
      <div className="gm-header">
        <h1>Global Expansion Opportunities for CTS BPO</h1>
        <p>Professional BPO Reach Worldwide</p>
      </div>

      <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '12px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🌐</span>
        <div style={{ fontSize: 13, color: '#a5b4fc', lineHeight: 1.6 }}>
          <strong style={{ color: '#818cf8' }}>Target Market Overview.</strong> This map shows the regions the AI agent is actively targeting for client outreach. Live client counts will appear on the Dashboard as contracts are signed.
        </div>
      </div>

      <div className="gm-map-container">
        <WorldMap />
      </div>

      <div className="gm-legend">
        {legend.map((l, i) => (
          <div key={i} className="gm-legend-item">
            <span className="gm-legend-dot" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>

      <div className="gm-explainer-grid">
        {MARKERS.map((m, i) => (
          <div
            key={i}
            className="gm-explainer-card"
            style={{ borderLeftColor: COLORS[m.region], boxShadow: `0 0 18px ${COLORS[m.region]}22` }}
          >
            <div className="gm-ec-header">
              <span className="gm-ec-dot" style={{ background: COLORS[m.region] }} />
              <span className="gm-ec-name">{m.emoji} {m.name}</span>
              <span className="gm-ec-badge" style={{ color: COLORS[m.region] }}>{m.label}</span>
            </div>
            <div className="gm-ec-headline">{m.headline}</div>
            <div className="gm-ec-subtitle">💡 Why this region matters</div>
            <p className="gm-ec-text">{m.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GlobalMarkets;
