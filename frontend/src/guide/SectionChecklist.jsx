// frontend/src/guide/SectionChecklist.jsx
import React, { useState } from 'react';
import { isItemDone, toggleItem } from './guideProgress';

export default function SectionChecklist({ view, moduleId, items, onChange }) {
  const [, force] = useState(0);
  if (!items?.length) return null;
  const handle = (id) => {
    toggleItem(view, moduleId, id);
    force((n) => n + 1);
    onChange?.();
  };
  return (
    <div>
      <h3>Ponlo en práctica</h3>
      <div className="nexus-guide-checklist">
        {items.map((it) => {
          const done = isItemDone(view, moduleId, it.id);
          return (
            <label key={it.id} className={done ? 'is-done' : ''}>
              <input type="checkbox" checked={done} onChange={() => handle(it.id)} />
              <span>{it.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
