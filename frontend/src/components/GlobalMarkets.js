import React, { useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';

/* ── Region colour palette ────────────────────────────────────────────────── */
const COLORS = {
  NA: '#3b82f6', // North America – blue  (High Opportunity)
  EU: '#22c55e', // Europe        – green (Key Market)
  AS: '#f59e0b', // Asia          – orange(Growth Potential)
  AF: '#eab308', // Africa        – gold  (Emerging Clients)
  OC: '#14b8a6', // Oceania       – teal  (Strategic Region)
};

/*
  Country-name → region lookup.
  Names must match the `properties.name` field in countries-110m.json exactly.
  Easy to extend: just add more names to any array below.
*/
const NAME_TO_REGION = {};
[
  // North America
  'United States of America', 'Canada', 'Mexico', 'Cuba', 'Jamaica',
  'Dominican Rep.', 'Haiti', 'Puerto Rico', 'Bahamas', 'Belize',
  'Costa Rica', 'El Salvador', 'Guatemala', 'Honduras', 'Nicaragua', 'Panama',
  'Trinidad and Tobago', 'Greenland',
].forEach(n => { NAME_TO_REGION[n] = 'NA'; });
[
  // Europe
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
  // Asia (including Middle East & Central Asia)
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
  // Africa
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
  // Oceania
  'Australia', 'Fiji', 'New Caledonia', 'New Zealand', 'Papua New Guinea',
  'Solomon Is.', 'Vanuatu',
].forEach(n => { NAME_TO_REGION[n] = 'OC'; });

/* ── Marker data (lat/long as [lng, lat]) ─────────────────────────────────── */
const MARKERS = [
  {
    name: 'North America',
    region: 'NA',
    coords: [-100, 40],
    clients: 78,
    label: 'High Opportunity',
    emoji: '🇺🇸',
    headline: 'Our biggest customer base 🚀',
    description:
      'We have 78 paying clients here. People in this region pay in US Dollars, which means each contract earns us more money than other regions. This is where most of our revenue comes from today.',
  },
  {
    name: 'Europe',
    region: 'EU',
    coords: [15, 50],
    clients: 62,
    label: 'Key Market',
    emoji: '🇪🇺',
    headline: 'Our most loyal clients 💚',
    description:
      '62 European clients trust us long-term. They renew contracts often and rarely cancel. Europe is where we build our reputation as a serious, professional BPO platform.',
  },
  {
    name: 'Asia',
    region: 'AS',
    coords: [100, 35],
    clients: 41,
    label: 'Growth Potential',
    emoji: '🌏',
    headline: 'Where we\'ll grow fastest 📈',
    description:
      'We only have 41 clients here today, but the population is huge. Even small growth means big new revenue. Our AI is targeting Asian small businesses next quarter.',
  },
  {
    name: 'Africa',
    region: 'AF',
    coords: [20, 0],
    clients: 24,
    label: 'Emerging Clients',
    emoji: '🌍',
    headline: 'Our home market 🏡',
    description:
      '24 clients across Africa, including South Africa where CTS BPO is based. These clients pay in ZAR and help us understand what local businesses need. Strong roots = strong growth.',
  },
  {
    name: 'Australia / Oceania',
    region: 'OC',
    coords: [135, -25],
    clients: 10,
    label: 'Strategic Region',
    emoji: '🇦🇺',
    headline: 'Small but valuable ⭐',
    description:
      'Only 10 clients, but they pay premium prices and rarely complain. Australia is a "quality over quantity" region — we keep them happy and they refer big enterprise contracts.',
  },
];

const legend = [
  { label: 'High Opportunity',  color: COLORS.NA },
  { label: 'Key Market',        color: COLORS.EU },
  { label: 'Growth Potential',  color: COLORS.AS },
  { label: 'Emerging Clients',  color: COLORS.AF },
  { label: 'Strategic Region',  color: COLORS.OC },
];

/* ── World Map with react-simple-maps ─────────────────────────────────────── */
function WorldMap() {
  const [tooltip, setTooltip] = useState(null);

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
          <Marker
            key={m.region}
            coordinates={m.coords}
            onMouseEnter={() => setTooltip(m)}
            onMouseLeave={() => setTooltip(null)}
          >
            <circle
              r={14}
              fill={COLORS[m.region]}
              stroke="#fff"
              strokeWidth={2}
              style={{ filter: `drop-shadow(0 0 6px ${COLORS[m.region]})`, cursor: 'pointer' }}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              fontSize={10}
              fontWeight="700"
              style={{ pointerEvents: 'none' }}
            >
              {m.clients}
            </text>
          </Marker>
        ))}
      </ComposableMap>

      {tooltip && (
        <div className="gm-tooltip">
          <strong>{tooltip.emoji} {tooltip.name}</strong>
          <span>{tooltip.clients} clients</span>
        </div>
      )}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
function GlobalMarkets() {
  return (
    <div className="gm-page">
      <div className="gm-header">
        <h1>Global Expansion Opportunities for CTS BPO</h1>
        <p>AI-Driven BPO Reach Worldwide</p>
      </div>

      <div className="gm-map-container">
        <WorldMap />
      </div>

      {/* Slim legend */}
      <div className="gm-legend">
        {legend.map((l, i) => (
          <div key={i} className="gm-legend-item">
            <span className="gm-legend-dot" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Plain-English explainer cards */}
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
            <div className="gm-ec-count" style={{ color: COLORS[m.region] }}>{m.clients}</div>
            <div className="gm-ec-count-label">active clients</div>
            <div className="gm-ec-headline">{m.headline}</div>
            <div className="gm-ec-subtitle">💡 What this means for the business</div>
            <p className="gm-ec-text">{m.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GlobalMarkets;
