import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerThirdPartyMatrix from './OwnerThirdPartyMatrix';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockList = jest.fn();
const mockDetail = jest.fn();
const mockListRequests = jest.fn();
const mockSubscriptionGet = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../api', () => ({
  ownerPremiumPlanAPI: { listRequests: (...args) => mockListRequests(...args) },
  subscriptionAPI: { get: (...args) => mockSubscriptionGet(...args) },
  thirdPartyMatrixAPI: {
    list: (...args) => mockList(...args),
    detail: (...args) => mockDetail(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    AnimatedNumber: ({ value }) => value,
    DetailDrawer: ({ open, children }) => open ? React.createElement('div', null, children) : null,
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MetricCard: ({ label, value }) => React.createElement('div', null, label, value),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    ResponsiveDataView: ({ items, columns }) => React.createElement('div', null, items.map(item => React.createElement('div', { key: item.organization_id }, columns[0].render(item)))),
    SegmentedControl: () => null,
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

describe('OwnerThirdPartyMatrix Premium summary', () => {
  let host;
  let root;

  beforeEach(() => {
    mockList.mockResolvedValue({ data: { items: [{ organization_id: 'org-1', name: 'Centro Uno', profile_status: 'complete' }], total: 1, total_pages: 1, page: 1 } });
    mockDetail.mockResolvedValue({ data: { organization: { organization_id: 'org-1', name: 'Centro Uno' }, fiscal_profile: {}, people: [] } });
    mockListRequests.mockResolvedValue({ data: { requests: [{ organization_id: 'org-1', status: 'active' }] } });
    mockSubscriptionGet.mockResolvedValue({ data: { status: 'active', manual_access_blocked: false } });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('shows Premium status read-only with a link and no legacy Nexus AI controls', async () => {
    await act(async () => root.render(<OwnerThirdPartyMatrix />));
    const openDetail = host.querySelector('button');
    await act(async () => {
      openDetail.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(host.querySelector('[data-testid="owner-premium-status"]').textContent).toContain('Activo');
    expect(host.textContent).toContain('Ver Plan Premium');
    expect(host.textContent).not.toContain('Retirar addon Nexus AI');
    expect(host.textContent).not.toContain('Marcar como contratado');
    const premiumLink = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Ver Plan Premium'));
    await act(async () => premiumLink.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    // NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 8): /owner/premium was a dead
    // link -- that route was never built. Points at Cartera now, where the
    // Premium plan panel actually lives (OwnerPremiumPlanPanel, rendered
    // inside OwnerSubscriptions).
    expect(mockNavigate).toHaveBeenCalledWith('/owner/billing');
    expect(mockListRequests).toHaveBeenCalledTimes(1);
  });

  // NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 9): subscription status and manual
  // access block shown separately from fiscal/Premium fields, reusing the
  // same subscriptionAPI.get() endpoint OwnerSubscriptions already calls.
  test('shows subscription status and manual access block separately from Premium and fiscal fields', async () => {
    mockSubscriptionGet.mockResolvedValue({ data: { status: 'suspended', manual_access_blocked: true } });
    await act(async () => root.render(<OwnerThirdPartyMatrix />));
    const openDetail = host.querySelector('button');
    await act(async () => {
      openDetail.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockSubscriptionGet).toHaveBeenCalledWith('org-1');
    const block = host.querySelector('[data-testid="owner-subscription-status"]');
    expect(block.textContent).toContain('Suspendida');
    expect(block.textContent).toContain('Bloqueado manualmente');

    const manageLink = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Gestionar suscripción y acceso'));
    await act(async () => manageLink.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(mockNavigate).toHaveBeenCalledWith('/owner/billing');
  });

  test('shows "Sin configurar" when the organization has no subscription yet', async () => {
    mockSubscriptionGet.mockResolvedValue({ data: null });
    await act(async () => root.render(<OwnerThirdPartyMatrix />));
    const openDetail = host.querySelector('button');
    await act(async () => {
      openDetail.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const block = host.querySelector('[data-testid="owner-subscription-status"]');
    expect(block.textContent).toContain('Sin configurar');
    expect(block.textContent).toContain('Activo');
  });
});
