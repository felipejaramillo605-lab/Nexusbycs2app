// NEXUS_PLATFORM_BRANDING_V1
// The Nexus PLATFORM's own logo -- global, owner-controlled, distinct from
// any tenant organization's own logo (OrganizationContext). Fetched once,
// unauthenticated, so it's available even on the login screen. Also owns
// the default browser-tab favicon: ClientPortalThemeWrapper temporarily
// overrides it with a specific tenant's logo while visiting that tenant's
// public pages, then restores whatever this context last set as the
// default when leaving.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { platformAPI } from '../api';

const PlatformBrandingContext = createContext({ platformLogoUrl: null, refreshPlatformBranding: () => {} });

const DEFAULT_ICON_SELECTOR = 'link[rel="icon"][type="image/x-icon"]';

export const PlatformBrandingProvider = ({ children }) => {
  const [platformLogoUrl, setPlatformLogoUrl] = useState(null);

  const refreshPlatformBranding = useCallback(async () => {
    try {
      const response = await platformAPI.getBranding();
      setPlatformLogoUrl(response?.data?.platform_logo_url || null);
    } catch {
      // No platform logo configured yet, or the request failed -- the
      // static default favicon/badge already baked into the build stays
      // as the fallback, so failing silently here is safe.
      setPlatformLogoUrl(null);
    }
  }, []);

  useEffect(() => { refreshPlatformBranding(); }, [refreshPlatformBranding]);

  // Applies the platform logo as the default browser-tab icon. Runs after
  // the fetch above resolves; a tenant-specific page (ClientPortalThemeWrapper)
  // may still override this while it's mounted, restoring this value on
  // its own unmount.
  useEffect(() => {
    if (!platformLogoUrl) return;
    const link = document.querySelector(DEFAULT_ICON_SELECTOR) || document.querySelector('link[rel="icon"]');
    if (link) link.setAttribute('href', platformLogoUrl);
  }, [platformLogoUrl]);

  return (
    <PlatformBrandingContext.Provider value={{ platformLogoUrl, refreshPlatformBranding }}>
      {children}
    </PlatformBrandingContext.Provider>
  );
};

export const usePlatformBranding = () => useContext(PlatformBrandingContext);
