import { CLIENT_PORTAL_THEMES, STANDARD_TEMPLATE_KEYS, getThemeColors, applyThemeToRoot } from './standard';
import { PREMIUM_TEMPLATE_IMPLEMENTATIONS, PREMIUM_TEMPLATE_KEYS, PREMIUM_TEMPLATE_METADATA } from './premium';

export { CLIENT_PORTAL_THEMES, STANDARD_TEMPLATE_KEYS, PREMIUM_TEMPLATE_KEYS, getThemeColors, applyThemeToRoot };
export { PREMIUM_TEMPLATE_IMPLEMENTATIONS, PREMIUM_TEMPLATE_METADATA };
export const PORTAL_TEMPLATE_KEYS = Object.freeze([...STANDARD_TEMPLATE_KEYS, ...PREMIUM_TEMPLATE_KEYS]);
export const PORTAL_TEMPLATE_METADATA = Object.freeze({
  ...Object.fromEntries(STANDARD_TEMPLATE_KEYS.map((key) => [key, Object.freeze({ key, tier: 'standard' })])),
  ...PREMIUM_TEMPLATE_METADATA,
});

export const resolvePremiumPortalTemplate = (organization, routeOrgId) => {
  if (!organization || !routeOrgId || organization.organization_id !== routeOrgId) return null;
  const implementation = PREMIUM_TEMPLATE_IMPLEMENTATIONS[organization.portal_template];
  return implementation?.tier === 'premium' ? implementation : null;
};
