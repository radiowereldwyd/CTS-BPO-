import React from 'react';

const HEIGHTS = { sm: 36, md: 52, lg: 96 };

export default function CTSLogo({ size = 'md', className = '' }) {
  const h = HEIGHTS[size] || HEIGHTS.md;
  return (
    <img
      src={process.env.PUBLIC_URL + '/cts-bpo-logo.png'}
      alt="CTS BPO — AI-Driven Outsourcing"
      height={h}
      className={`cts-logo ${className}`}
      style={{ height: h, width: 'auto', display: 'block' }}
    />
  );
}


