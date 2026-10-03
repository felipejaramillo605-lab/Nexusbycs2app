import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RouteExperienceFrame } from './RouteExperienceFrame';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockLoadOrganization = jest.fn();
let mockOrganization = { organization_id: 'org-1', name: 'Empresa Real' };

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/manager/services' }),
  useSearchParams: () => [new URLSearchParams('?org_id=org-1')],
}), { virtual: true });
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'owner' } }) }));
jest.mock('../../context/OrganizationContext', () => ({ useOrganization: () => ({ organization: mockOrganization, loadOrganization: mockLoadOrganization }) }));
jest.mock('../../context/PlatformBrandingContext', () => ({ usePlatformBranding: () => ({ platformLogoUrl: null }) }));
jest.mock('framer-motion', () => ({ useReducedMotion: () => true }));
jest.mock('./AdminShell', () => ({ AdminShell: ({ children, organizationName }) => <div data-testid="shell" data-organization-name={organizationName}>{children}</div> }));
jest.mock('./StaffNav', () => ({ StaffNav: () => null }));
jest.mock('./ConfirmDialogHost', () => ({ ConfirmDialogHost: () => null }));
jest.mock('../onboarding/OnboardingTour', () => () => null);
jest.mock('../../portal-templates', () => ({ resolvePremiumPortalTemplate: () => null }));

describe('RouteExperienceFrame', () => {
  let root;

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    mockLoadOrganization.mockClear();
  });

  test('shows the real organization name when an owner operates a manager route', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<RouteExperienceFrame><p>Contenido</p></RouteExperienceFrame>));

    expect(host.querySelector('[data-testid="shell"]').dataset.organizationName).toBe('Empresa Real');
    expect(host.textContent).not.toContain('Servicios');
    expect(mockLoadOrganization).toHaveBeenCalledWith('org-1');
  });
});
