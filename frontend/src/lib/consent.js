export const CONSENT_VERSION = '1';
export const CONSENT_STORAGE_KEY = 'nexus-consent-v1';

// Register optional analytics/marketing providers here before loading them. The
// list is empty today, so ConsentBanner deliberately remains hidden.
export const OPTIONAL_PROVIDERS = [];

const defaultConsent = () => ({
  version: CONSENT_VERSION,
  updatedAt: null,
  necessary: true,
  analytics: false,
  marketing: false,
});

export function getConsent() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    if (stored?.version === CONSENT_VERSION) return { ...defaultConsent(), ...stored, necessary: true };
  } catch (_) {
    // Privacy choices must fail closed when storage is unavailable or malformed.
  }
  return defaultConsent();
}

export function saveConsent(choice) {
  const consent = { ...defaultConsent(), ...choice, necessary: true, version: CONSENT_VERSION, updatedAt: new Date().toISOString() };
  try { window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent)); } catch (_) { /* fail closed */ }
  return consent;
}

export function hasOptionalProviders() {
  return OPTIONAL_PROVIDERS.length > 0;
}

export function whenConsented(category, loader) {
  const consent = getConsent();
  if (category !== 'necessary' && !consent[category]) return false;
  loader();
  return true;
}
