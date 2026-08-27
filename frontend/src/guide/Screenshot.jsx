// frontend/src/guide/Screenshot.jsx
import React from 'react';

export default function Screenshot({ src, alt, zones = [] }) {
  if (!src) {
    return (
      <div className="nexus-guide-shot-placeholder" role="img" aria-label={alt}>
        {alt || 'Captura pendiente'}
      </div>
    );
  }
  return (
    <figure className="nexus-guide-shot">
      <img src={src} alt={alt} loading="lazy" />
      {zones.map((z) => (
        <span
          key={z.n}
          className="nexus-guide-shot-marker"
          style={{ left: `${z.xPct}%`, top: `${z.yPct}%` }}
          aria-hidden="true"
        >
          {z.n}
        </span>
      ))}
    </figure>
  );
}
