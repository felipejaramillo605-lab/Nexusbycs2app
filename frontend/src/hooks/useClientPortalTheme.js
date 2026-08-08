import { useEffect } from 'react';
import { applyThemeToRoot } from '../constants/clientPortalThemes';

/**
 * Hook to apply client portal theme based on organization settings
 * Only applies to public-facing client pages
 */
export const useClientPortalTheme = (organization) => {
  useEffect(() => {
    if (organization) {
      const themeKey = organization.client_portal_theme || 'classic';
      applyThemeToRoot(themeKey);
    } else {
      // Default to classic if no organization data yet
      applyThemeToRoot('classic');
    }
    
    // Cleanup: reset to classic theme when component unmounts
    return () => {
      applyThemeToRoot('classic');
    };
  }, [organization]);
};
