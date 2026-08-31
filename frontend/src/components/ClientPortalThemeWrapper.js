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

  // NEXUS_CLIENT_THEME_STALE_CACHE_FIX_V1: OrganizationContext is a single
  // provider mounted once for the whole app (see App.js), so its state
  // survives client-side route navigation within the same tab. The old
  // guard here ("only reload if the id looks different") meant that if an
  // owner/manager visited /manager/settings for org X (loading X into the
  // shared context) and then opened /book/X in the same tab, this wrapper
  // saw organization.organization_id already equal to orgId and skipped
  // the fetch entirely -- showing whatever org snapshot was in memory from
  // before, even if client_portal_theme had just been changed and saved.
  // These are public, always-should-be-fresh pages, so always refetch on
  // mount instead of trusting a cache that another part of the app owns.
  useEffect(() => {
    if (orgId) loadOrganization(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const themeKey = CLIENT_PORTAL_THEMES[organization?.client_portal_theme]
    ? organization.client_portal_theme
    : 'classic';
  const theme = getThemeColors(themeKey);

  // NEXUS_ORG_BRANDING_EVERYWHERE_V1: swap the browser tab icon to this
  // org's own logo while a visitor is on their booking/portal pages, and
  // restore the platform's default favicon on unmount (navigating to
  // another org, or leaving the client-facing pages entirely). This only
  // affects the live browser tab -- it can't change what Google shows for
  // nexusbycs2.com in search results, since that's a single static
  // favicon.ico crawled for the bare domain, not something a client-side
  // script can influence per organization.
  useEffect(() => {
    const matches = organization?.organization_id === orgId;
    const logoUrl = matches ? organization?.logo_url : null;
    if (!logoUrl) return undefined;
    const link = document.querySelector('link[rel="icon"][type="image/x-icon"]') || document.querySelector('link[rel="icon"]');
    if (!link) return undefined;
    const previousHref = link.getAttribute('href');
    link.setAttribute('href', logoUrl);
    return () => { link.setAttribute('href', previousHref); };
  }, [organization?.organization_id, organization?.logo_url, orgId]);

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
