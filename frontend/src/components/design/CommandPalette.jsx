import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AccessibleModal } from './AccessibleModal';

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 10): search over the REAL navigation
// registry AdminShell is already rendering (ownerConsoleSections for an
// owner's console, adminSections for a manager or an owner operating a
// tenant) -- no invented actions or commands, only "go to this real page",
// per the plan's explicit "sin inventar acciones".
export function CommandPalette({ open, onClose, items, onSelect }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q) || item.section.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => { setQuery(''); setActiveIndex(0); }, [open]);
  useEffect(() => { setActiveIndex(0); }, [query]);

  if (!open) return null;

  const select = (item) => { if (item) onSelect(item.path); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); select(filtered[activeIndex]); }
  };

  return (
    <AccessibleModal open={open} onClose={onClose} role="dialog" labelledBy="nexus-command-palette-title" panelClassName="nexus-accessible-modal-panel nexus-command-palette-panel">
      <h2 id="nexus-command-palette-title" className="nexus-command-palette-title">Buscar en la navegación</h2>
      <div className="nexus-command-palette-input">
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Buscar una sección o página..." aria-label="Buscar en la navegación" />
      </div>
      <ul className="nexus-command-palette-list" role="listbox">
        {filtered.length === 0 ? (
          <li className="nexus-command-palette-empty">Sin resultados para &quot;{query}&quot;</li>
        ) : (
          filtered.map((item, index) => (
            <li key={item.path}>
              <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'is-active' : ''} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(item)}>
                <item.Icon size={17} />
                <span><strong>{item.label}</strong><small>{item.section}</small></span>
              </button>
            </li>
          ))
        )}
      </ul>
    </AccessibleModal>
  );
}
