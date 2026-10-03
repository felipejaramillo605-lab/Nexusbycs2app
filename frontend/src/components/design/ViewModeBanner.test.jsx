import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewModeBanner } from './ViewModeBanner';
import { getViewSession, setViewSession } from '../../lib/viewMode';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockEnd = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('sonner', () => ({ toast: { info: jest.fn() } }));
jest.mock('../../api', () => ({ ownerViewAPI: { end: (...args) => mockEnd(...args) } }));

const future = () => new Date(Date.now() + 25 * 60 * 1000).toISOString();

describe('ViewModeBanner', () => {
  let host;
  let root;

  beforeEach(() => {
    window.sessionStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('renders nothing outside view mode', async () => {
    await act(async () => root.render(<ViewModeBanner />));
    expect(host.querySelector('[data-testid="view-mode-banner"]')).toBeNull();
  });

  test('shows organization, read-only mode and remaining time, and exits through the server', async () => {
    setViewSession({ view_id: 'ovs_1', organization_id: 'org-1', organization_name: 'Centro Uno', expires_at: future() });
    mockEnd.mockResolvedValue({ data: { ended: true } });
    await act(async () => root.render(<ViewModeBanner />));
    const banner = host.querySelector('[data-testid="view-mode-banner"]');
    expect(banner.textContent).toContain('Centro Uno');
    expect(banner.textContent).toContain('solo lectura');
    expect(banner.textContent).toMatch(/expira en 2\d:\d\d/);
    await act(async () => { banner.querySelector('button').click(); });
    expect(mockEnd).toHaveBeenCalledWith('ovs_1');
    expect(getViewSession()).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/owner', { replace: true });
  });

  test('an expired stored session is discarded instead of shown', async () => {
    setViewSession({ view_id: 'ovs_old', organization_id: 'org-1', expires_at: new Date(Date.now() - 1000).toISOString() });
    await act(async () => root.render(<ViewModeBanner />));
    expect(host.querySelector('[data-testid="view-mode-banner"]')).toBeNull();
    expect(getViewSession()).toBeNull();
  });

  test('a server "session ended" signal leaves view mode', async () => {
    setViewSession({ view_id: 'ovs_1', organization_id: 'org-1', expires_at: future() });
    await act(async () => root.render(<ViewModeBanner />));
    await act(async () => { window.dispatchEvent(new CustomEvent('nexus:view-mode-ended')); });
    expect(mockNavigate).toHaveBeenCalledWith('/owner', { replace: true });
    expect(host.querySelector('[data-testid="view-mode-banner"]')).toBeNull();
  });
});
