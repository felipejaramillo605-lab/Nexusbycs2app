import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganization } from '../context/OrganizationContext';
import { CLIENT_PORTAL_THEMES, getThemeColors } from '../constants/clientPortalThemes';
import OnboardingTour from './onboarding/OnboardingTour';

const hexToRgba = (hex, alpha) => {
  const value = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(8,122,245,${alpha})`;
  const number = Number.parseInt(value, 16);
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
};

export const ClientPortalThemeWrapper = ({ children }) => {
  const { orgId } = useParams();
  const { organization, loadOrganization } = useOrganization();
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (orgId && organization?.organization_id !== orgId) loadOrganization(orgId);
  }, [orgId, organization?.organization_id, loadOrganization]);

  const themeKey = CLIENT_PORTAL_THEMES[organization?.client_portal_theme]
    ? organization.client_portal_theme
    : 'classic';
  const theme = getThemeColors(themeKey);

  // Override body/html/root backgrounds so the manager-dashboard dark
  // gradient never bleeds through behind the themed portal wrapper.
  useEffect(() => {
    const body = document.body;
    const root = document.getElementById('root');
    const html = document.documentElement;
    const prev = {
      bodyBg: body.style.background,
      bodyBgImage: body.style.backgroundImage,
      htmlBg: html.style.background,
      rootBg: root ? root.style.background : '',
    };
    const base = theme.bgEnd;
    body.style.background = base;
    body.style.backgroundImage = 'none';
    html.style.background = base;
    if (root) root.style.background = base;
    return () => {
      body.style.background = prev.bodyBg;
      body.style.backgroundImage = prev.bodyBgImage;
      html.style.background = prev.htmlBg;
      if (root) root.style.background = prev.rootBg;
    };
  }, [theme.bgEnd]);

  // Mouse-tracking glow: set CSS custom properties directly on the DOM
  // element to avoid React re-renders on every mousemove frame.
  const handleMouseMove = useCallback((e) => {
    const el = wrapperRef.current;
    if (!el) return;
    el.style.setProperty('--mouse-x', `${e.clientX}px`);
    el.style.setProperty('--mouse-y', `${e.clientY}px`);
    el.style.setProperty('--mouse-active', '1');
  }, []);

  const themeVariables = useMemo(() => ({
    '--client-bg-start': theme.bgStart,
    '--client-bg-end': theme.bgEnd,
    '--client-accent-primary': theme.accentPrimary,
    '--client-accent-secondary': theme.accentSecondary,
    '--app-background': theme.bgStart,
    '--app-background-soft': theme.bgEnd,
    '--app-surface': hexToRgba(theme.bgEnd, .90),
    '--app-surface-solid': theme.bgEnd,
    '--app-surface-elevated': theme.bgEnd,
    '--app-surface-muted': hexToRgba(theme.accentPrimary, .10),
    '--app-surface-hover': hexToRgba(theme.accentPrimary, .16),
    '--app-text-primary': theme.textPrimary,
    '--app-text-secondary': theme.textSecondary,
    '--app-text-muted': theme.textSecondary,
    '--app-border': hexToRgba(theme.accentPrimary, .24),
    '--app-border-strong': hexToRgba(theme.accentPrimary, .42),
    '--app-primary': theme.accentPrimary,
    '--app-primary-hover': theme.accentSecondary,
    '--app-primary-soft': hexToRgba(theme.accentPrimary, .14),
    '--app-focus-ring': hexToRgba(theme.accentPrimary, .32),
    '--app-shadow-sm': `0 2px 10px ${hexToRgba(theme.accentPrimary, .10)}`,
    '--app-shadow-md': `0 12px 34px ${hexToRgba(theme.accentPrimary, .16)}`,
    '--app-shadow-lg': `0 28px 70px ${hexToRgba(theme.accentPrimary, .22)}`,
    '--app-on-primary': theme.onAccentPrimary || '#ffffff',
    '--app-on-primary-hover': theme.onAccentSecondary || theme.onAccentPrimary || '#ffffff',
    '--client-surface': theme.surface,
    '--client-surface-glass': theme.surfaceGlass,
    '--client-border': theme.border,
    '--client-blur-amount': theme.blurAmount,
    '--client-glass-shadow': theme.glassShadow,
    // v13.1: animated background orbs + mouse-tracking glow
    '--client-orb-1': hexToRgba(theme.accentPrimary, .10),
    '--client-orb-2': hexToRgba(theme.accentSecondary, .08),
    '--client-glow': hexToRgba(theme.accentPrimary, .12),
  }), [theme]);

  return (
    <div
      ref={wrapperRef}
      className="nexus-client-theme"
      data-client-theme={themeKey}
      style={themeVariables}
      onMouseMove={handleMouseMove}
    >
      <OnboardingTour role="client" />
      {children}
    </div>
  );
};
