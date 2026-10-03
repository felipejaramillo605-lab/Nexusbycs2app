import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'fs';
import path from 'path';
import { StaffNav } from './StaffNav';
import ProtectedRoute from '../ProtectedRoute';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockLogout = jest.fn().mockResolvedValue();
let mockUser = null;
jest.mock('react-router-dom', () => ({
  NavLink: ({ to, children, className, ...rest }) => <a href={to} className={className} {...rest}>{children}</a>,
  Navigate: ({ to }) => <div data-testid="redirect" data-to={to} />,
  useLocation: () => ({ pathname: '/manager/barbers/pro-1/metrics' }),
  useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false, subscriptionSuspended: false, logout: mockLogout }),
}));

describe('StaffNav and Metrics route access', () => {
  let host;
  let root;

  const renderElement = async (element) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(element));
  };

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    mockUser = null;
    jest.clearAllMocks();
  });

  test('includes links to staff reviews and the guide', async () => {
    await renderElement(<StaffNav />);
    expect(host.querySelector('a[href="/staff/reviews"]')?.textContent).toContain('Reseñas');
    expect(host.querySelector('a[href="/staff/guia"]')?.textContent).toContain('Guía');
  });

  test('keeps four daily destinations in the bar and folds guide, account and sign-out into "Más"', async () => {
    await renderElement(<StaffNav />);
    const primary = [...host.querySelectorAll('a:not(.nexus-staff-secondary)')].map(link => link.getAttribute('href'));
    expect(primary).toEqual(['/staff/appointments', '/staff/income', '/staff/reviews', '/staff/profile']);
    expect(host.querySelector('[data-testid="staff-more-panel"]')).toBeNull();
    const more = host.querySelector('button.nexus-staff-more');
    await act(async () => more.click());
    const panel = host.querySelector('[data-testid="staff-more-panel"]');
    expect([...panel.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(['Guía', 'Cuenta', 'Salir']);
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  test('Escape closes the "Más" menu and its sign-out logs out', async () => {
    await renderElement(<StaffNav />);
    await act(async () => host.querySelector('button.nexus-staff-more').click());
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(host.querySelector('[data-testid="staff-more-panel"]')).toBeNull();
    await act(async () => host.querySelector('button.nexus-staff-more').click());
    const signOut = [...host.querySelectorAll('[data-testid="staff-more-panel"] [role="menuitem"]')].find(item => item.textContent === 'Salir');
    await act(async () => signOut.click());
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  test('Metrics route allows owner, manager and admin, and redirects staff', async () => {
    const appSource = readFileSync(path.resolve(__dirname, '../../App.js'), 'utf8');
    const metricsRoute = appSource.match(/<Route path="\/manager\/barbers\/:barberId\/metrics" element={<ProtectedRoute allowedRoles={(\[[^\]]+\])}>/);
    expect(metricsRoute).not.toBeNull();
    const allowedRoles = Array.from(metricsRoute[1].matchAll(/'([^']+)'/g), (match) => match[1]);
    expect(allowedRoles).toEqual(['owner', 'manager', 'admin']);

    for (const role of allowedRoles) {
      mockUser = { role, access_status: 'approved' };
      await renderElement(<ProtectedRoute allowedRoles={allowedRoles}><span data-testid="metrics">Métricas</span></ProtectedRoute>);
      expect(host.querySelector('[data-testid="metrics"]')).not.toBeNull();
      await act(async () => root.unmount());
      root = null;
      host.remove();
    }

    mockUser = { role: 'staff', access_status: 'approved' };
    await renderElement(<ProtectedRoute allowedRoles={allowedRoles}><span data-testid="metrics">Métricas</span></ProtectedRoute>);
    expect(host.querySelector('[data-testid="metrics"]')).toBeNull();
    expect(host.querySelector('[data-testid="redirect"]')?.getAttribute('data-to')).toBe('/staff/appointments');
  });
});