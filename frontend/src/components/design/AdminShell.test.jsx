import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminShell } from './AdminShell';

global.IS_REACT_ACT_ENVIRONMENT = true;

let mockUser = { role: 'owner' };
let mockPathname = '/owner';
let mockSearch = '';

// react-router-dom cannot be resolved by this project's Jest config (it
// ships ESM-only, same reason every other test in this repo mocks it
// instead of using a real router) -- so, same as those, this provides just
// enough of the API surface for AdminShell to run, driven by the two
// module-level vars above instead of a real MemoryRouter.
jest.mock('react-router-dom', () => {
  const React = jest.requireActual('react');
  return {
    NavLink: ({ to, children, className, ...props }) => {
      const cls = typeof className === 'function' ? className({ isActive: false }) : className;
      return React.createElement('a', { href: to, className: cls, ...props }, children);
    },
    useLocation: () => ({ pathname: mockPathname, search: mockSearch }),
    useNavigate: () => jest.fn(),
    useSearchParams: () => [new URLSearchParams(mockSearch)],
  };
}, { virtual: true });
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, logout: jest.fn() }) }));
jest.mock('../../context/OrganizationContext', () => ({ useOrganization: () => ({ organization: null, loadOrganization: jest.fn() }) }));
jest.mock('../../context/PlatformBrandingContext', () => ({ usePlatformBranding: () => ({ platformLogoUrl: null }) }));
jest.mock('../ThemeToggle', () => () => null);
jest.mock('../NotificationBellEnhanced', () => () => null);
jest.mock('../onboarding/OnboardingTour', () => () => null);

async function renderAt(pathname, search = '') {
  mockPathname = pathname;
  mockSearch = search;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<AdminShell organizationName="Test">contenido</AdminShell>);
  });
  return { host, root };
}

async function cleanup(root) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
}

// NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 7): the shell now shows a different
// menu depending on whether an owner is in their own console (/owner/*) or
// operating a tenant (/manager/*) -- this is the split the whole PR hinges
// on, so it gets direct coverage rather than relying on the pages that
// happen to mock AdminShell away entirely.
describe('AdminShell owner/manager navigation split', () => {
  let root;
  afterEach(() => cleanup(root));

  test('owner console mode shows the owner sections, not the Manager operational menu', async () => {
    mockUser = { role: 'owner' };
    const rendered = await renderAt('/owner');
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Control de accesos');
    expect(rendered.host.textContent).not.toContain('Agenda');
    expect(rendered.host.querySelector('.nexus-owner-context-pill')).toBeNull();
  });

  test('owner operating a tenant sees the Manager menu plus a way back to the console', async () => {
    mockUser = { role: 'owner' };
    const rendered = await renderAt('/manager/dashboard', '?org_id=org-1');
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Agenda');
    const pill = rendered.host.querySelector('.nexus-owner-context-pill');
    expect(pill).toBeTruthy();
    expect(pill.getAttribute('href')).toBe('/owner');
  });

  test('a manager never sees the owner-only pill or console sections', async () => {
    mockUser = { role: 'manager' };
    const rendered = await renderAt('/manager/dashboard');
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Agenda');
    expect(rendered.host.textContent).not.toContain('Control de accesos');
    expect(rendered.host.querySelector('.nexus-owner-context-pill')).toBeNull();
  });
});
