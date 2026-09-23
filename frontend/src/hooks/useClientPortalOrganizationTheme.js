import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganization } from '../context/OrganizationContext';
import { CLIENT_PORTAL_THEMES, getThemeColors } from '../constants/clientPortalThemes';

const hexToRgba = (hex, alpha) => {
  const value = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(8,122,245,${alpha})`;
  const number = Number.parseInt(value, 16);
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
};

/** Organization loading and theme adaptation shared by the public portal shell. */
export function useClientPortalOrganizationTheme() {
  const { orgId } = useParams();
  const { organization, loadOrganization } = useOrganization();
  const wrapperRef = useRef(null);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReduceMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Always refresh on mount because OrganizationContext is shared with the
  // manager area and may contain a stale snapshot for this organization.
  useEffect(() => {
    if (orgId) loadOrganization(orgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const themeKey = CLIENT_PORTAL_THEMES[organization?.client_portal_theme]
    ? organization.client_portal_theme
    : 'classic';
  const theme = getThemeColors(themeKey);
  const backgroundType = organization?.organization_id === orgId ? organization?.portal_background_type : 'none';
  const backgroundUrl = organization?.organization_id === orgId ? organization?.portal_background_url : null;
  const backgroundOverlay = organization?.portal_background_overlay || 'dark';
  const showBackground = !backgroundFailed && backgroundUrl && (backgroundType === 'image' || backgroundType === 'video');

  useEffect(() => { setBackgroundFailed(false); }, [backgroundUrl, backgroundType]);

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

  useEffect(() => {
    const body = document.body;
    const root = document.getElementById('root');
    const html = document.documentElement;
    const previous = {
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
      body.style.background = previous.bodyBg;
      body.style.backgroundImage = previous.bodyBgImage;
      html.style.background = previous.htmlBg;
      if (root) root.style.background = previous.rootBg;
    };
  }, [theme.bgEnd]);

  const handleMouseMove = useCallback((event) => {
    const element = wrapperRef.current;
    if (!element) return;
    element.style.setProperty('--mouse-x', `${event.clientX}px`);
    element.style.setProperty('--mouse-y', `${event.clientY}px`);
    element.style.setProperty('--mouse-active', '1');
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
    '--client-orb-1': hexToRgba(theme.accentPrimary, .10),
    '--client-orb-2': hexToRgba(theme.accentSecondary, .08),
    '--client-glow': hexToRgba(theme.accentPrimary, .12),
  }), [theme]);

  return {
    orgId,
    organization,
    loadOrganization,
    wrapperRef,
    backgroundFailed,
    setBackgroundFailed,
    reduceMotion,
    themeKey,
    theme,
    backgroundType,
    backgroundUrl,
    backgroundOverlay,
    showBackground,
    handleMouseMove,
    themeVariables,
  };
}
