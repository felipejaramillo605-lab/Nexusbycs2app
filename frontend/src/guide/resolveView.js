// frontend/src/guide/resolveView.js
export const VIEW_ORDER = ['owner', 'manager', 'staff'];

export function viewsForRole(role) {
  if (role === 'owner') return ['owner', 'manager', 'staff'];
  if (role === 'manager' || role === 'admin') return ['manager', 'staff'];
  return ['staff'];
}

export function resolveView(role, requested) {
  const views = viewsForRole(role);
  const activeView = views.includes(requested) ? requested : views[0];
  return { views, activeView };
}
