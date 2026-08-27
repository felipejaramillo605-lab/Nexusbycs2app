// frontend/src/guide/guideProgress.js
export const STORAGE_KEY = 'nexus-guide-progress';

export function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(blob) {
  try {
    if (!blob || Object.keys(blob).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    }
  } catch {
    /* storage unavailable — no-op */
  }
}

function prune(blob) {
  for (const view of Object.keys(blob)) {
    for (const mod of Object.keys(blob[view])) {
      for (const item of Object.keys(blob[view][mod])) {
        if (!blob[view][mod][item]) delete blob[view][mod][item];
      }
      if (Object.keys(blob[view][mod]).length === 0) delete blob[view][mod];
    }
    if (Object.keys(blob[view]).length === 0) delete blob[view];
  }
  return blob;
}

export function isItemDone(view, moduleId, itemId) {
  return Boolean(readAll()?.[view]?.[moduleId]?.[itemId]);
}

export function toggleItem(view, moduleId, itemId) {
  const blob = readAll();
  blob[view] = blob[view] || {};
  blob[view][moduleId] = blob[view][moduleId] || {};
  if (blob[view][moduleId][itemId]) {
    delete blob[view][moduleId][itemId];
  } else {
    blob[view][moduleId][itemId] = true;
  }
  const pruned = prune(blob);
  writeAll(pruned);
  return pruned;
}

export function moduleProgress(view, moduleId, totalItems) {
  const items = readAll()?.[view]?.[moduleId] || {};
  const done = Object.values(items).filter(Boolean).length;
  const total = totalItems || 0;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function globalProgress(view, modules) {
  let done = 0;
  let total = 0;
  for (const m of modules) {
    const p = moduleProgress(view, m.id, m.checklistCount);
    done += p.done;
    total += p.total;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
