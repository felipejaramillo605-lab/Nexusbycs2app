import React, { useEffect, useMemo } from 'react';
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

  useEffect(() => {
    if (orgId && organization?.organization_id !== orgId) loadOrganization(orgId);
  }, [orgId, organization?.organization_id, loadOrganization]);

  const themeKey = CLIENT_PORTAL_THEMES[organization?.client_portal_theme]
    ? organization.client_portal_theme
    : 'classic';
  const theme = getThemeColors(themeKey);
  const themeVariables = useMemo(() => ({
    '--client-bg-start': theme.bgStart,
    '--client-bg-end': theme.bgEnd,
    '--client-accent-primary': theme.accentPrimary,
    '--client-accent-secondary': theme.accentSecondary,
    '--client-text-primary': theme.textPrimary,
    '--client-text-secondary': theme.textSecondary,
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
  }), [theme]);

  return (
    <div className="nexus-client-theme" data-client-theme={themeKey} style={themeVariables}>
      <OnboardingTour role="client" />
      {children}
    </div>
  );
};
