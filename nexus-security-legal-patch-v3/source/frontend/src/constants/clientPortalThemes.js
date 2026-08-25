// Client Portal Visual Themes
// These themes apply ONLY to public-facing client pages:
// - BookingFlow.js, CustomerPortal.js, ClientPortalAuth.js, ClientPortalDashboard.js, 
//   ForgotPin.js, ResetPin.js, CancelAppointment.js
// Manager/owner dashboards maintain their current styling unchanged

export const CLIENT_PORTAL_THEMES = {
  classic: {
    key: 'classic',
    name: 'Original',
    description: 'El tema actual sin cambios',
    bgStart: '#0a0a0a',
    bgEnd: '#1a1a1a',
    accentPrimary: '#0A84FF',
    accentSecondary: '#FF9500',
    textPrimary: '#ffffff',
    textSecondary: '#aaaaaa',
    textShadow: 'none',
    boxShadow: 'none',
  },
  
  feminine: {
    key: 'feminine',
    name: 'Elegante',
    description: 'Salones de belleza, uñas, spas',
    bgStart: '#fdf2f6',
    bgEnd: '#fbe4ec',
    accentPrimary: '#D4849A',
    accentSecondary: '#C9A876',
    textPrimary: '#4a2c35',
    textSecondary: '#8a6570',
    textShadow: 'none',
    boxShadow: 'none',
  },
  
  professional: {
    key: 'professional',
    name: 'Profesional',
    description: 'Barberías ejecutivas, consultorios',
    bgStart: '#0f172a',
    bgEnd: '#1e293b',
    accentPrimary: '#38bdf8',
    accentSecondary: '#e2e8f0',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    textShadow: 'none',
    boxShadow: 'none',
  },
  
  cyberpunk: {
    key: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Estética urbana futurista, gaming',
    bgStart: '#0d0221',
    bgEnd: '#1a0533',
    accentPrimary: '#ff2e88',
    accentSecondary: '#00f0ff',
    textPrimary: '#f5f5f5',
    textSecondary: '#b39ddb',
    textShadow: '0 0 10px rgba(255, 46, 136, 0.5)',
    boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
  },
  
  underground: {
    key: 'underground',
    name: 'Underground',
    description: 'Estilo urbano/grunge, tattoo shops',
    bgStart: '#1a1a1a',
    bgEnd: '#0a0a0a',
    accentPrimary: '#c1272d',
    accentSecondary: '#8a8a8a',
    textPrimary: '#e8e8e8',
    textSecondary: '#777777',
    textShadow: 'none',
    boxShadow: 'none',
  },
  
  neutral: {
    key: 'neutral',
    name: 'Neutral Empresarial',
    description: 'Cálido pero sobrio, sin identidad marcada',
    bgStart: '#f4f5f7',
    bgEnd: '#e9eaed',
    accentPrimary: '#5b8a72',
    accentSecondary: '#c9a24b',
    textPrimary: '#2d2d2d',
    textSecondary: '#6b6b6b',
    textShadow: 'none',
    boxShadow: 'none',
  },

  // NEXUS_PORTAL_PERSONALIZATION_V1
  minimalist_purple: {
    key: 'minimalist_purple',
    name: 'Minimalista Morado',
    description: 'Fondo claro, acento morado. Tema por defecto de Nexus',
    bgStart: '#fafaf9',
    bgEnd: '#f3f4f6',
    accentPrimary: '#7c3aed',
    accentSecondary: '#6d28d9',
    textPrimary: '#1f2937',
    textSecondary: '#6b7280',
    textShadow: 'none',
    boxShadow: 'none',
  },
};

export const getThemeColors = (themeKey = 'classic') => {
  return CLIENT_PORTAL_THEMES[themeKey] || CLIENT_PORTAL_THEMES.classic;
};

export const applyThemeToRoot = (themeKey = 'classic') => {
  const theme = getThemeColors(themeKey);
  const root = document.documentElement;
  
  root.style.setProperty('--client-bg-start', theme.bgStart);
  root.style.setProperty('--client-bg-end', theme.bgEnd);
  root.style.setProperty('--client-accent-primary', theme.accentPrimary);
  root.style.setProperty('--client-accent-secondary', theme.accentSecondary);
  root.style.setProperty('--client-text-primary', theme.textPrimary);
  root.style.setProperty('--client-text-secondary', theme.textSecondary);
  root.style.setProperty('--client-text-shadow', theme.textShadow);
  root.style.setProperty('--client-box-shadow', theme.boxShadow);
};
