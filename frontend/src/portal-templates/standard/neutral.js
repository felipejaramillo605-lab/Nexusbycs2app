// Keep the persisted "neutral" key stable for organizations that already selected this color theme.
export const neutral = {
    key: 'neutral', // NOTE: internal key unchanged on purpose -- renaming it
    // would silently break every organization that already saved
    // client_portal_theme: 'neutral' to their DB record. Only the
    // display name/description (what's shown in the theme picker) changes.
    name: 'Verde Natural',
    description: 'Verde salvia y dorado cálido, orgánico y sobrio',
    bgStart: '#f4f5f7',
    bgEnd: '#e9eaed',
    accentPrimary: '#5b8a72',
    accentSecondary: '#c9a24b',
    textPrimary: '#2d2d2d',
    textSecondary: '#6b6b6b',
    textShadow: 'none',
    boxShadow: 'none',
  };
export default neutral;
