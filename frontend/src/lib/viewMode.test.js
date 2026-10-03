import { api } from '../api';
import { VIEW_HEADER, clearViewSession, setViewSession } from './viewMode';

describe('view mode API header', () => {
  afterEach(() => clearViewSession());

  const headerFor = async () => {
    let seen;
    await api.get('/anything', {
      adapter: async (config) => {
        seen = config.headers[VIEW_HEADER];
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
      },
    });
    return seen;
  };

  test('requests carry the view session id only while view mode is active', async () => {
    expect(await headerFor()).toBeUndefined();
    setViewSession({ view_id: 'ovs_9', organization_id: 'org-1', expires_at: new Date(Date.now() + 60000).toISOString() });
    expect(await headerFor()).toBe('ovs_9');
    clearViewSession();
    expect(await headerFor()).toBeUndefined();
  });

  test('a server read-only block is announced to the UI and a session-ended response clears the session', async () => {
    setViewSession({ view_id: 'ovs_9', organization_id: 'org-1', expires_at: new Date(Date.now() + 60000).toISOString() });
    const blocked = jest.fn();
    const ended = jest.fn();
    window.addEventListener('nexus:view-mode-blocked', blocked);
    window.addEventListener('nexus:view-mode-ended', ended);
    const reject = (status, code) => api.put('/x', {}, {
      adapter: async (config) => { const error = new Error('x'); error.response = { status, data: { detail: { code, message: 'm' } }, config }; throw error; },
    }).catch(() => null);
    await reject(403, 'VIEW_MODE_READ_ONLY');
    expect(blocked).toHaveBeenCalledTimes(1);
    await reject(401, 'VIEW_SESSION_EXPIRED');
    expect(ended).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('nexus_view_session')).toBeNull();
    window.removeEventListener('nexus:view-mode-blocked', blocked);
    window.removeEventListener('nexus:view-mode-ended', ended);
  });
});
