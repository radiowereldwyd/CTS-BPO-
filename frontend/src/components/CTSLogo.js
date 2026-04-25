import React from 'react';

export default function CTSLogo({ size = 'md', className = '' }) {
  const heights = { sm: 36, md: 56, lg: 110 };
  const h = heights[size] || heights.md;

  return (
    <img
      src="/cts-bpo-logo.png"
      alt="CTS BPO - AI-Driven Outsourcing"
      className={className}
      style={{
        height: h + 'px',
        width: 'auto',
        display: 'block',
        objectFit: 'contain',
      }}
    />
  );
}