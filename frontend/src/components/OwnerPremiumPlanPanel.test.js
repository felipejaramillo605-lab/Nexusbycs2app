import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerPremiumPlanPanel from './OwnerPremiumPlanPanel';

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockListRequests = jest.fn();
const mockLinkInvoice = jest.fn();
const mockSetEntitlement = jest.fn();
const mockConfirmAction = jest.fn();
jest.mock('../api', () => ({
  ownerPremiumPlanAPI: {
    createRequestId: () => 'operation-id',
    listRequests: (...args) => mockListRequests(...args),
    linkInvoice: (...args) => mockLinkInvoice(...args),
    setEntitlement: (...args) => mockSetEntitlement(...args),
  },
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('./design', () => ({
  ActionButton: ({ children, icon: _icon, variant: _variant, loading: _loading, ...props }) => {
    const React = jest.requireActual('react');
    return React.createElement('button', { type: 'button', ...props }, children);
  },
  SurfaceCard: ({ children }) => {
    const React = jest.requireActual('react');
    return React.createElement('section', null, children);
  },
  EmptyState: ({ title, description }) => {
    const React = jest.requireActual('react');
    return React.createElement('div', null, React.createElement('strong', null, title), React.createElement('p', null, description));
  },
  confirmAction: (...args) => mockConfirmAction(...args),
}));

describe('OwnerPremiumPlanPanel', () => {
  let host;
  let root;
  const request = { request_id: 'ppr-1', organization_id: 'org-1', organization_name: 'Tienda', status: 'pending' };
  const renderPanel = async (invoices, requests = [request], onSelectOrganization = jest.fn()) => {
    mockListRequests.mockResolvedValue({ data: { requests } });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<OwnerPremiumPlanPanel organizationId="org-1" organizationName="Tienda" invoices={invoices} reload={jest.fn().mockResolvedValue()} onSelectOrganization={onSelectOrganization} />));
  };

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
    mockConfirmAction.mockResolvedValue(true);
  });

  test('offers only eligible unpaid manual invoices and waits for full payment before activation', async () => {
    const invoices = [
      { invoice_id: 'eligible', organization_id: 'org-1', provider: 'manual', status: 'pending', amount_minor: 5000, balance_minor: 5000 },
      { invoice_id: 'online', organization_id: 'org-1', provider: 'stripe', status: 'pending' },
      { invoice_id: 'already-linked', organization_id: 'org-1', provider: 'manual', status: 'pending', invoice_purpose: 'subscription' },
      { invoice_id: 'other-org', organization_id: 'org-2', provider: 'manual', status: 'pending' },
    ];
    await renderPanel(invoices);
    const optionValues = [...host.querySelectorAll('select option')].map(option => option.value);
    expect(optionValues).toContain('eligible');
    expect(optionValues).not.toContain('online');
    expect(optionValues).not.toContain('already-linked');
    expect(optionValues).not.toContain('other-org');
  });

  test.each([
    ['partial amount', { amount_minor: 5000, paid_amount_minor: 4500, balance_minor: 0 }],
    ['missing amount evidence', { amount_minor: 5000, balance_minor: 0 }],
    ['missing balance evidence', { amount_minor: 5000, paid_amount_minor: 5000 }],
    ['positive balance', { amount_minor: 5000, paid_amount_minor: 5000, balance_minor: 1 }],
  ])('does not render activation with %s', async (_label, amounts) => {
    await renderPanel([{ invoice_id: 'linked', organization_id: 'org-1', provider: 'manual', status: 'paid', premium_request_id: 'ppr-1', invoice_purpose: 'premium_plan_excess', ...amounts }]);
    expect(host.textContent).toContain('Confirma el pago manual completo');
    expect(host.textContent).not.toContain('Activar Premium');
  });

  test('does not render activation for an invoice that has not reached paid status', async () => {
    await renderPanel([{ invoice_id: 'linked', organization_id: 'org-1', provider: 'manual', status: 'pending', premium_request_id: 'ppr-1', invoice_purpose: 'premium_plan_excess', amount_minor: 5000, paid_amount_minor: 5000, balance_minor: 0 }]);
    expect(host.textContent).not.toContain('Activar Premium');
  });

  test('keeps requests from all organizations and selects one to load its invoices', async () => {
    const chooseOrganization = jest.fn();
    const otherRequest = { request_id: 'ppr-2', organization_id: 'org-2', organization_name: 'Otra tienda', status: 'pending' };
    await renderPanel([], [request, otherRequest], chooseOrganization);
    expect(host.textContent).toContain('Otra tienda');
    const selectButton = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Administrar organización'));
    await act(async () => selectButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(chooseOrganization).toHaveBeenCalledWith('org-2');
  });

  test('confirms activation accessibly before changing entitlement', async () => {
    mockConfirmAction.mockResolvedValue(true);
    mockSetEntitlement.mockResolvedValue({ data: { contracted: true } });
    const fullyPaid = { invoice_id: 'linked', organization_id: 'org-1', provider: 'manual', status: 'paid', premium_request_id: 'ppr-1', invoice_purpose: 'premium_plan_excess', amount_minor: 5000, paid_amount_minor: 5000, balance_minor: 0 };
    await renderPanel([fullyPaid]);
    const activate = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Activar Premium'));
    await act(async () => {
      activate.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(mockConfirmAction).toHaveBeenCalledWith(expect.stringContaining('pagada por completo'), expect.objectContaining({ title: 'Activar Premium' }));
    expect(mockSetEntitlement).toHaveBeenCalledWith('org-1', expect.objectContaining({ contracted: true, premium_request_id: 'ppr-1', invoice_id: 'linked' }), 'operation-id');
  });
});
