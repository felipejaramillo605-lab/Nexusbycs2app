import classic from './classic';
import feminine from './feminine';
import professional from './professional';
import cyberpunk from './cyberpunk';
import underground from './underground';
import neutral from './neutral';
import minimalist_purple from './minimalist_purple';

export const STANDARD_TEMPLATE_KEYS = Object.freeze([
  'classic', 'feminine', 'professional', 'cyberpunk', 'underground', 'neutral', 'minimalist_purple',
]);

export const CLIENT_PORTAL_THEMES = Object.freeze({
  classic, feminine, professional, cyberpunk, underground, neutral, minimalist_purple,
});

export const getThemeColors = (themeKey = 'classic') => (
  CLIENT_PORTAL_THEMES[themeKey] || CLIENT_PORTAL_THEMES.classic
);

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
