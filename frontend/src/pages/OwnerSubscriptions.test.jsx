import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerSubscriptions from './OwnerSubscriptions';

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockOrganizationGetAll = jest.fn();
const mockSubscriptionGet = jest.fn();
const mockGetInvoices = jest.fn();
const mockGetAudit = jest.fn();
const mockConfirmManualPayment = jest.fn();
const mockChangeInvoiceState = jest.fn();
const mockBlockOrganization = jest.fn();
const mockReactivateOrganization = jest.fn();
const mockDownloadPdf = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('sonner', () => ({ toast: { error: (...args) => mockToastError(...args), success: (...args) => mockToastSuccess(...args) } }));
jest.mock('../api', () => ({
  organizationAPI: { getAll: (...args) => mockOrganizationGetAll(...args) },
  subscriptionAPI: {
    get: (...args) => mockSubscriptionGet(...args), getInvoices: (...args) => mockGetInvoices(...args),
    getAudit: (...args) => mockGetAudit(...args), save: jest.fn(), createInvoice: jest.fn(),
    confirmManualPayment: (...args) => mockConfirmManualPayment(...args),
    changeInvoiceState: (...args) => mockChangeInvoiceState(...args),
    blockOrganization: (...args) => mockBlockOrganization(...args),
    reactivateOrganization: (...args) => mockReactivateOrganization(...args),
  },
  billingAPI: { getProfile: jest.fn(), getNotifications: jest.fn(), saveProfile: jest.fn(), downloadPdf: (...args) => mockDownloadPdf(...args) },
  deliveryOperationsAPI: { getDeliveries: jest.fn(), backfill: jest.fn(), retry: jest.fn() },
  ownerAPI: { getUsers: jest.fn() },
  platformBillingAPI: { getSellerProfile: jest.fn(), getOperationalHealth: jest.fn(), saveSellerProfile: jest.fn() },
  supportAPI: { ownerList: jest.fn() },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    AccessibleModal: ({ children, labelledBy, role = 'dialog' }) => React.createElement('div', { role, 'aria-labelledby': labelledBy }, children),
    ActionButton: ({ children, icon: _icon, variant: _variant, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    AdminShell: Box, SurfaceCard: Box, MotionPage: Box,
    EmptyState: ({ title, description }) => React.createElement('div', null, title, description),
    FieldGuide: ({ label }) => React.createElement('span', null, label),
    LoadingState: ({ label }) => React.createElement('div', null, label),
    MetricCard: ({ label, value }) => React.createElement('div', null, label, value),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
  };
});
jest.mock('../components/OwnerPremiumPlanPanel', () => () => null);

describe('OwnerSubscriptions invoice actions', () => {
  let host;
  let root;
  const invoice = { invoice_id: 'inv-1', invoice_number: 'NXS-1', organization_id: 'org-1', period_start: '2026-09-01', period_end: '2026-09-30', due_at: '2026-09-10', amount_minor: 15000000, currency: 'COP', status: 'pending' };

  const renderPage = async (row = invoice) => {
    mockOrganizationGetAll.mockResolvedValue({ data: [{ organization_id: 'org-1', name: 'Empresa Uno' }] });
    mockSubscriptionGet.mockResolvedValue({ data: { status: 'active', monthly_amount_minor: 15000000, currency: 'COP', plan_code: 'monthly', billing_day: 1 } });
    mockGetInvoices.mockResolvedValue({ data: [row] });
    mockGetAudit.mockResolvedValue({ data: [] });
    require('../api').billingAPI.getProfile.mockResolvedValue({ data: { cc_emails: [] } });
    require('../api').deliveryOperationsAPI.getDeliveries.mockResolvedValue({ data: [] });
    require('../api').billingAPI.getNotifications.mockResolvedValue({ data: [] });
    require('../api').supportAPI.ownerList.mockResolvedValue({ data: [] });
    require('../api').platformBillingAPI.getSellerProfile.mockResolvedValue({ data: {} });
    require('../api').platformBillingAPI.getOperationalHealth.mockResolvedValue({ data: {} });
    require('../api').ownerAPI.getUsers.mockResolvedValue({ data: [] });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<OwnerSubscriptions />);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };

  const button = (label) => [...host.querySelectorAll('button')].filter(item => item.textContent.includes(label)).at(-1);
  const change = async (element, value) => act(async () => {
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('downloads the organization invoice PDF through billingAPI', async () => {
    await renderPage();
    mockDownloadPdf.mockResolvedValue({ data: new Blob(['pdf']) });
    URL.createObjectURL = jest.fn(() => 'blob:invoice');
    URL.revokeObjectURL = jest.fn();
    await act(async () => button('PDF').click());
    expect(mockDownloadPdf).toHaveBeenCalledWith('inv-1', { organization_id: 'org-1' });
    expect(host.textContent).not.toContain('window.prompt');
  });

  test('keeps invoice state actions inside a reason dialog and sends only status and reason', async () => {
    await renderPage();
    mockChangeInvoiceState.mockResolvedValue({ data: {} });
    await act(async () => button('Anular').click());
    const reason = host.querySelector('textarea');
    expect(reason).toBeTruthy();
    await change(reason, 'Factura duplicada');
    await act(async () => button('Anular factura').click());
    expect(mockChangeInvoiceState).toHaveBeenCalledWith('org-1', 'inv-1', { status: 'void', reason: 'Factura duplicada' });
  });

  test('reuses the manual payment idempotency key after a retry', async () => {
    await renderPage();
    mockConfirmManualPayment.mockRejectedValueOnce(new Error('network timeout')).mockResolvedValueOnce({ data: {} });
    await act(async () => button('Confirmar pago').click());
    const reference = host.querySelector('input[maxlength="200"]');
    await change(reference, 'REC-12345');
    await act(async () => button('Confirmar pago').click());
    await act(async () => button('Confirmar pago').click());
    expect(mockConfirmManualPayment).toHaveBeenCalledTimes(2);
    const firstKey = mockConfirmManualPayment.mock.calls[0][2].idempotency_key;
    const retryKey = mockConfirmManualPayment.mock.calls[1][2].idempotency_key;
    expect(firstKey).toBe(retryKey);
  });

  test('shows the Premium lock message when a refund receives 409', async () => {
    await renderPage({ ...invoice, status: 'paid' });
    const locked = new Error('lock');
    locked.response = { status: 409, data: { detail: 'Disable Premium' } };
    mockChangeInvoiceState.mockRejectedValue(locked);
    await act(async () => button('Reembolsar').click());
    await change(host.querySelector('textarea'), 'Devolución acordada');
    await act(async () => button('Reembolsar').click());
    expect(mockToastError).toHaveBeenCalledWith('Desactiva Premium antes de reembolsar');
  });

  test('requires an explicit backfill confirmation and a valid reason before applying', async () => {
    await renderPage();
    const backfill = require('../api').deliveryOperationsAPI.backfill;
    backfill.mockResolvedValue({ data: { items: [{ invoice_id: 'inv-old' }] } });
    await act(async () => button('Diagnóstico dry-run').click());
    expect(backfill).toHaveBeenCalledWith({ organization_id: 'org-1', apply: false });
    await act(async () => button('Aplicar backfill').click());
    expect(host.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(backfill).toHaveBeenCalledTimes(1);
    expect(backfill.mock.calls.some(([payload]) => payload.apply === true)).toBe(false);
    const reason = host.querySelector('[role="alertdialog"] textarea');
    await change(reason, 'Documento revisado y aprobado');
    await act(async () => button('Confirmar backfill').click());
    expect(backfill).toHaveBeenLastCalledWith({ organization_id: 'org-1', apply: true, reason: 'Documento revisado y aprobado' });
  });
});
