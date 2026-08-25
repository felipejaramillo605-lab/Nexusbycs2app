// NEXUS_ONBOARDING_V1
// Simple, on-brand line-art illustrations for the onboarding tour.
// These are original SVG diagrams (not screenshots of the running app).
import React from 'react';

const stroke = 'var(--app-primary, #7C3AED)';
const muted = 'var(--app-text-secondary, #6B7280)';

const Frame = ({ children }) => (
  <svg viewBox="0 0 240 160" className="w-full h-40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="238" height="158" rx="16" fill="var(--app-surface-muted, #F3F4F6)" stroke="var(--app-border, #E5E7EB)" />
    {children}
  </svg>
);

export const IllustrationDashboard = () => (
  <Frame>
    <rect x="20" y="24" width="60" height="36" rx="8" stroke={stroke} strokeWidth="2.5" />
    <rect x="90" y="24" width="60" height="36" rx="8" stroke={stroke} strokeWidth="2.5" />
    <rect x="160" y="24" width="60" height="36" rx="8" stroke={muted} strokeWidth="2" />
    <path d="M20 80h200" stroke="var(--app-border,#E5E7EB)" strokeWidth="2" />
    <rect x="20" y="96" width="200" height="14" rx="7" fill={stroke} opacity=".18" />
    <rect x="20" y="118" width="140" height="14" rx="7" fill={stroke} opacity=".12" />
    <rect x="20" y="140" width="90" height="10" rx="5" fill="var(--app-border,#E5E7EB)" />
  </Frame>
);

export const IllustrationCalendar = () => (
  <Frame>
    <rect x="30" y="20" width="180" height="120" rx="10" stroke={stroke} strokeWidth="2.5" />
    <path d="M30 48h180" stroke={stroke} strokeWidth="2" />
    {[0, 1, 2, 3, 4].map(row => (
      <g key={row}>
        {[0, 1, 2, 3, 4, 5].map(col => (
          <rect key={col} x={38 + col * 27} y={58 + row * 15} width="20" height="10" rx="3"
            fill={(row + col) % 5 === 0 ? stroke : 'var(--app-border,#E5E7EB)'}
            opacity={(row + col) % 5 === 0 ? '.55' : '.4'} />
        ))}
      </g>
    ))}
  </Frame>
);

export const IllustrationClients = () => (
  <Frame>
    <circle cx="70" cy="55" r="18" stroke={stroke} strokeWidth="2.5" />
    <path d="M40 110c6-20 22-30 30-30s24 10 30 30" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="165" cy="50" r="14" stroke={muted} strokeWidth="2" />
    <path d="M142 96c5-15 16-22 23-22s18 7 23 22" stroke={muted} strokeWidth="2" strokeLinecap="round" />
    <rect x="20" y="128" width="200" height="10" rx="5" fill="var(--app-border,#E5E7EB)" />
  </Frame>
);

export const IllustrationBilling = () => (
  <Frame>
    <rect x="60" y="20" width="120" height="120" rx="10" stroke={stroke} strokeWidth="2.5" />
    <path d="M78 44h84M78 60h84M78 76h50" stroke="var(--app-border,#E5E7EB)" strokeWidth="3" strokeLinecap="round" />
    <circle cx="150" cy="108" r="20" fill={stroke} opacity=".14" stroke={stroke} strokeWidth="2" />
    <path d="M142 108l6 6 12-12" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

export const IllustrationTeam = () => (
  <Frame>
    <circle cx="60" cy="50" r="16" stroke={stroke} strokeWidth="2.5" />
    <circle cx="120" cy="42" r="16" fill={stroke} opacity=".15" stroke={stroke} strokeWidth="2.5" />
    <circle cx="180" cy="50" r="16" stroke={muted} strokeWidth="2" />
    <path d="M30 110c5-18 18-26 30-26s25 8 30 26M90 116c5-20 20-30 30-30s25 10 30 30M150 110c5-18 18-26 30-26" stroke="var(--app-border,#E5E7EB)" strokeWidth="2" strokeLinecap="round" />
  </Frame>
);

export const IllustrationBooking = () => (
  <Frame>
    <rect x="30" y="24" width="180" height="30" rx="8" fill={stroke} opacity=".14" stroke={stroke} strokeWidth="2" />
    <rect x="30" y="66" width="84" height="60" rx="10" stroke={muted} strokeWidth="2" />
    <rect x="126" y="66" width="84" height="60" rx="10" stroke={stroke} strokeWidth="2.5" />
    <path d="M148 96l10 10 20-20" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

export const IllustrationPortalHome = () => (
  <Frame>
    <circle cx="120" cy="45" r="20" stroke={stroke} strokeWidth="2.5" />
    <path d="M60 100c8-6 40-6 60-6s52 0 60 6" stroke="var(--app-border,#E5E7EB)" strokeWidth="2" />
    <rect x="50" y="112" width="140" height="18" rx="9" fill={stroke} opacity=".16" />
  </Frame>
);

export const ONBOARDING_ILLUSTRATIONS = {
  dashboard: IllustrationDashboard,
  calendar: IllustrationCalendar,
  clients: IllustrationClients,
  billing: IllustrationBilling,
  team: IllustrationTeam,
  booking: IllustrationBooking,
  portal: IllustrationPortalHome,
};
