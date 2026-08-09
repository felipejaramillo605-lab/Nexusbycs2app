import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'nexus-theme';
const VALID = new Set(['light', 'dark', 'system']);

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
};

const getSystemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID.has(stored) ? stored : 'system';
  });
  const [systemDark, setSystemDark] = useState(getSystemDark);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = event => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.classList.toggle('light', resolvedTheme === 'light');
    root.dataset.theme = theme;
    root.style.colorScheme = resolvedTheme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, resolvedTheme]);

  const setTheme = value => setThemeState(VALID.has(value) ? value : 'system');
  const toggleTheme = () => setThemeState(current => current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light');
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme, toggleTheme }), [theme, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
