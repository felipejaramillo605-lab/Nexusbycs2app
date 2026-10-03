export const VIEW_HEADER = 'X-Nexus-View-Session';
const KEY = 'nexus_view_session';

export function getViewSession() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.view_id || new Date(session.expires_at) <= new Date()) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setViewSession(session) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // storage unavailable: view mode simply will not persist across reloads
  }
}

export function clearViewSession() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
