import React, { useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const choices = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor }
];

export default function ThemeToggle({ compact = false }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ActiveIcon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  return <div className="nexus-theme-control">
    <button type="button" className="nexus-icon-button" onClick={() => setOpen(value => !value)} aria-label="Cambiar apariencia" aria-expanded={open}>
      <ActiveIcon size={18}/>{!compact && <span>Apariencia</span>}
    </button>
    {open && <div className="nexus-theme-menu" role="menu">
      <p>Apariencia</p>
      {choices.map(({ value, label, Icon }) => <button key={value} type="button" role="menuitemradio" aria-checked={theme === value} onClick={() => { setTheme(value); setOpen(false); }}>
        <Icon size={17}/><span>{label}</span>{theme === value && <Check size={16} className="ml-auto"/>}
      </button>)}
    </div>}
  </div>;
}
