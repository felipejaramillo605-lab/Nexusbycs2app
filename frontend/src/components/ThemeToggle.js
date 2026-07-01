import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl glass-panel hover:opacity-80 transition-all"
      aria-label="Toggle theme"
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {theme === 'dark' ? (
        <Sun size={20} strokeWidth={1.5} className="text-yellow-400" />
      ) : (
        <Moon size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
      )}
      <span className="hidden md:inline text-sm text-primary">
        {theme === 'dark' ? 'Claro' : 'Oscuro'}
      </span>
    </button>
  );
};

export default ThemeToggle;
