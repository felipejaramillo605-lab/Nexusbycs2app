import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerThirdPartyMatrix from './OwnerThirdPartyMatrix';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockList = jest.fn();
const mockDetail = jest.fn();
const mockStartView = jest.fn();
const mockImpact = jest.fn();
const mockSetViewSession = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../lib/viewMode', () => ({ setViewSession: (...args) => mockSetViewSession(...args) }));
jest.mock('../api', () => ({
  ownerViewAPI: { start: (...args) => mockStartView(...args) },
  ownerAPI: { getDeletionImpact: (...args) => mockImpact(...args) },
  thirdPartyMatrixAPI: {
    list: (...args) => mockList(...args),
    detail: (...args) => mockDetail(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    AccessibleModal: ({ open, children }) => open ? React.createElement('div', { role: 'dialog' }, children) : null,
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
    mockDetail.mockResolvedValue({ data: { organization: { organization_id: 'org-1', name: 'Centro Uno' }, fiscal_profile: {}, people: [], subscription: { status: 'active', manual_access_blocked: false }, premium_status: 'active' } });
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
    expect(mockNavigate).toHaveBeenCalledWith('/owner/billing?org_id=org-1');
    // NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 15): third_party_detail now
    // embeds premium_status/subscription server-side, so opening the ficha
    // is a single detail() call instead of three.
    expect(mockDetail).toHaveBeenCalledTimes(1);
    expect(mockDetail).toHaveBeenCalledWith('org-1');
  });

  // NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 9, consolidated in plan PR 15):
  // subscription status and manual access block shown separately from
  // fiscal/Premium fields, now read straight from the consolidated detail
  // response instead of a second client-side call.
  test('shows subscription status and manual access block separately from Premium and fiscal fields', async () => {
    mockDetail.mockResolvedValue({ data: { organization: { organization_id: 'org-1', name: 'Centro Uno' }, fiscal_profile: {}, people: [], subscription: { status: 'suspended', manual_access_blocked: true }, premium_status: 'active' } });
    await act(async () => root.render(<OwnerThirdPartyMatrix />));
    const openDetail = host.querySelector('button');
    await act(async () => {
      openDetail.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const block = host.querySelector('[data-testid="owner-subscription-status"]');
    expect(block.textContent).toContain('Suspendida');
    expect(block.textContent).toContain('Bloqueado manualmente');

    const manageLink = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Gestionar suscripción y acceso'));
    await act(async () => manageLink.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(mockNavigate).toHaveBeenCalledWith('/owner/billing?org_id=org-1');
  });

  test('shows "Sin configurar" when the organization has no subscription yet', async () => {
    mockDetail.mockResolvedValue({ data: { organization: { organization_id: 'org-1', name: 'Centro Uno' }, fiscal_profile: {}, people: [], subscription: null, premium_status: 'not_requested' } });
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

  test('enters read-only view mode only with a real reason, then opens that organization', async () => {
    mockStartView.mockResolvedValue({ data: { view_id: 'ovs_1', organization_id: 'org-1', organization_name: 'Centro Uno', expires_at: '2099-01-01T00:00:00+00:00' } });
    await act(async () => root.render(<OwnerThirdPartyMatrix />));
    await act(async () => {
      host.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const open = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Ver cuenta (solo lectura)'));
    await act(async () => open.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const dialog = host.ownerDocument.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('No podrás modificar datos');
    const submit = [...dialog.querySelectorAll('button')].find(button => button.textContent.includes('Entrar en modo visualización'));
    expect(submit.disabled).toBe(true);
    await act(async () => {
      const area = dialog.querySelector('textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, 'Revisar reporte de soporte');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(submit.disabled).toBe(false);
    await act(async () => { dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(mockStartView).toHaveBeenCalledWith('org-1', 'Revisar reporte de soporte');
    expect(mockSetViewSession).toHaveBeenCalledWith(expect.objectContaining({ view_id: 'ovs_1' }));
    expect(mockNavigate).toHaveBeenCalledWith('/manager/dashboard?org_id=org-1');
  });

  test('offers organization deletion from the detail drawer and asks for the impact first', async () => {
    mockImpact.mockResolvedValue({ data: { users: 2, upcoming_appointments: 1, clients: 5, enabled_owners: 0 } });
    await act(async () => root.render(<OwnerThirdPartyMatrix />));
    await act(async () => {
      host.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const remove = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Eliminar organización'));
    await act(async () => { remove.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(mockImpact).toHaveBeenCalledWith('org-1');
    expect([...host.ownerDocument.querySelectorAll('[role="dialog"]')].some(d => d.textContent.includes('Vas a eliminar') && d.textContent.includes('Centro Uno'))).toBe(true);
  });
});
