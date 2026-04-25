import React from 'react';

export default function CTSLogo({ size = 'md', className = '' }) {
  const heights = { sm: 32, md: 48, lg: 80 };
  const h = heights[size] || heights.md;
  const w = Math.round(h * (400 / 120));

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 400 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CTS BPO — AI-Driven Outsourcing"
      className={className}
    >
      <defs>
        {/* Background gradient */}
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0a1530" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>

        {/* Globe gradient */}
        <radialGradient id="globeGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="60%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </radialGradient>

        {/* Arrow gradient */}
        <linearGradient id="arrowGrad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#93c5fd" />
        </linearGradient>

        {/* Vignette / inner glow */}
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0" />
          <stop offset="100%" stopColor="#0a1530" stopOpacity="0.6" />
        </radialGradient>

        {/* Arrow glow filter */}
        <filter id="arrowGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Globe clip circle */}
        <clipPath id="globeClip">
          <circle cx="72" cy="60" r="42" />
        </clipPath>
      </defs>

      {/* Background */}
      <rect width="400" height="120" rx="12" ry="12" fill="url(#bgGrad)" />
      <rect width="400" height="120" rx="12" ry="12" fill="url(#vignette)" />

      {/* ── Globe ── */}
      <circle cx="72" cy="60" r="42" fill="url(#globeGrad)" opacity="0.95" />

      {/* Latitude lines clipped inside globe */}
      <g clipPath="url(#globeClip)" opacity="0.55">
        <ellipse cx="72" cy="60" rx="42" ry="10" fill="none" stroke="#93c5fd" strokeWidth="1" />
        <ellipse cx="72" cy="60" rx="42" ry="22" fill="none" stroke="#93c5fd" strokeWidth="0.8" />
        <ellipse cx="72" cy="60" rx="42" ry="36" fill="none" stroke="#93c5fd" strokeWidth="0.6" />
        {/* Equator */}
        <line x1="30" y1="60" x2="114" y2="60" stroke="#93c5fd" strokeWidth="1.2" />
        {/* Vertical meridian */}
        <line x1="72" y1="18" x2="72" y2="102" stroke="#93c5fd" strokeWidth="0.8" />
        {/* Continent-like blobs */}
        <path d="M55,42 Q60,38 67,42 Q72,46 70,52 Q65,56 58,54 Q52,50 55,42Z"
              fill="#1d4ed8" opacity="0.7" />
        <path d="M78,52 Q84,48 90,52 Q94,58 90,64 Q84,66 78,62 Q74,57 78,52Z"
              fill="#1d4ed8" opacity="0.6" />
        <path d="M58,66 Q63,62 70,66 Q73,72 68,76 Q62,78 57,74 Q53,69 58,66Z"
              fill="#1d4ed8" opacity="0.5" />
      </g>

      {/* Globe rim highlight */}
      <circle cx="72" cy="60" r="42" fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.6" />
      <circle cx="72" cy="60" r="42" fill="none" stroke="#cbd5e1" strokeWidth="0.4" opacity="0.3" />

      {/* ── Three upward arrows emerging from behind the globe ── */}
      {/* Left arrow (shorter) */}
      <g filter="url(#arrowGlow)">
        <line x1="54" y1="78" x2="54" y2="32" stroke="url(#arrowGrad)" strokeWidth="3.5"
              strokeLinecap="round" />
        <polygon points="54,20 48,34 60,34" fill="url(#arrowGrad)" />
      </g>

      {/* Center arrow (tallest) */}
      <g filter="url(#arrowGlow)">
        <line x1="72" y1="85" x2="72" y2="20" stroke="url(#arrowGrad)" strokeWidth="4.5"
              strokeLinecap="round" />
        <polygon points="72,8 64,24 80,24" fill="url(#arrowGrad)" />
      </g>

      {/* Right arrow (medium) */}
      <g filter="url(#arrowGlow)">
        <line x1="90" y1="80" x2="90" y2="38" stroke="url(#arrowGrad)" strokeWidth="3.5"
              strokeLinecap="round" />
        <polygon points="90,26 84,40 96,40" fill="url(#arrowGrad)" />
      </g>

      {/* ── Wordmark ── */}
      <text
        x="136"
        y="68"
        fontFamily="'Inter', 'Poppins', 'Segoe UI', system-ui, sans-serif"
        fontWeight="800"
        fontSize="38"
        fill="#ffffff"
        letterSpacing="2"
      >
        CTS BPO
      </text>

      {/* ── Tagline ── */}
      <text
        x="138"
        y="87"
        fontFamily="'Inter', 'Poppins', 'Segoe UI', system-ui, sans-serif"
        fontWeight="500"
        fontSize="11"
        fill="#cbd5e1"
        letterSpacing="3"
        textAnchor="start"
      >
        AI-DRIVEN OUTSOURCING
      </text>
    </svg>
  );
}
