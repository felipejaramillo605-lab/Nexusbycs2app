import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import InvoicesTableCard from './InvoicesTableCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockConfirmManualPayment = jest.fn();
const mockChangeInvoiceState = jest.fn();
const mockDownloadPdf = jest.fn();
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();

jest.mock('sonner', () => ({ toast: { error: (...args) => mockToastError(...args), success: (...args) => mockToastSuccess(...args) } }));
jest.mock('../../api', () => ({
  subscriptionAPI: {
    confirmManualPayment: (...args) => mockConfirmManualPayment(...args),
    changeInvoiceState: (...args) => mockChangeInvoiceState(...args),
  },
  billingAPI: { downloadPdf: (...args) => mockDownloadPdf(...args) },
}));
jest.mock('../design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    AccessibleModal: ({ children, labelledBy, role = 'dialog' }) => React.createElement('div', { role, 'aria-labelledby': labelledBy }, children),
    ActionButton: ({ children, icon: _icon, variant: _variant, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    EmptyState: ({ title, description }) => React.createElement('div', null, title, description),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: Box,
  };
});

const invoice = { invoice_id: 'inv-1', invoice_number: 'NXS-1', period_start: '2026-09-01', period_end: '2026-09-30', due_at: '2026-09-10', amount_minor: 15000000, currency: 'COP', status: 'pending' };

async function renderComponent(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<InvoicesTableCard {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

async function cleanup(root) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
  jest.clearAllMocks();
}

const button = (host, label) => [...host.querySelectorAll('button')].filter((b) => b.textContent.includes(label)).at(-1);
const change = async (element, value) => act(async () => {
  const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('InvoicesTableCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('renders the empty state when there are no invoices', async () => {
    const rendered = await renderComponent({ invoices: [], organizationId: 'org-1', organizationName: 'Empresa Uno', onReload: jest.fn() });
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Sin facturas');
  });

  test('downloads the invoice PDF through billingAPI', async () => {
    mockDownloadPdf.mockResolvedValue({ data: new Blob(['pdf']) });
    URL.createObjectURL = jest.fn(() => 'blob:invoice');
    URL.revokeObjectURL = jest.fn();
    const rendered = await renderComponent({ invoices: [invoice], organizationId: 'org-1', organizationName: 'Empresa Uno', onReload: jest.fn() });
    root = rendered.root;
    await act(async () => button(rendered.host, 'PDF').click());
    expect(mockDownloadPdf).toHaveBeenCalledWith('inv-1', { organization_id: 'org-1' });
  });

  test('keeps invoice state actions inside a reason dialog and sends only status and reason', async () => {
    mockChangeInvoiceState.mockResolvedValue({ data: {} });
    const onReload = jest.fn().mockResolvedValue();
    const rendered = await renderComponent({ invoices: [invoice], organizationId: 'org-1', organizationName: 'Empresa Uno', onReload });
    root = rendered.root;
    await act(async () => button(rendered.host, 'Anular').click());
    const reason = rendered.host.querySelector('[role="alertdialog"] textarea');
    expect(reason).toBeTruthy();
    await change(reason, 'Factura duplicada');
    await act(async () => button(rendered.host, 'Anular factura').click());
    expect(mockChangeInvoiceState).toHaveBeenCalledWith('org-1', 'inv-1', { status: 'void', reason: 'Factura duplicada' });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test('reuses the manual payment idempotency key after a retry', async () => {
    mockConfirmManualPayment.mockRejectedValueOnce(new Error('network timeout')).mockResolvedValueOnce({ data: {} });
    const rendered = await renderComponent({ invoices: [invoice], organizationId: 'org-1', organizationName: 'Empresa Uno', onReload: jest.fn() });
    root = rendered.root;
    await act(async () => button(rendered.host, 'Confirmar pago').click());
    const reference = rendered.host.querySelector('input[maxlength="200"]');
    await change(reference, 'REC-12345');
    await act(async () => button(rendered.host, 'Confirmar pago').click());
    await act(async () => button(rendered.host, 'Confirmar pago').click());
    expect(mockConfirmManualPayment).toHaveBeenCalledTimes(2);
    const firstKey = mockConfirmManualPayment.mock.calls[0][2].idempotency_key;
    const retryKey = mockConfirmManualPayment.mock.calls[1][2].idempotency_key;
    expect(firstKey).toBe(retryKey);
  });

  test('shows the Premium lock message when a refund receives 409', async () => {
    const locked = new Error('lock');
    locked.response = { status: 409, data: { detail: 'Disable Premium' } };
    mockChangeInvoiceState.mockRejectedValue(locked);
    const rendered = await renderComponent({ invoices: [{ ...invoice, status: 'paid' }], organizationId: 'org-1', organizationName: 'Empresa Uno', onReload: jest.fn() });
    root = rendered.root;
    await act(async () => button(rendered.host, 'Reembolsar').click());
    await change(rendered.host.querySelector('[role="alertdialog"] textarea'), 'Devolución acordada');
    await act(async () => button(rendered.host, 'Reembolsar').click());
    expect(mockToastError).toHaveBeenCalledWith('Desactiva Premium antes de reembolsar');
  });

  test('paid, non-refundable invoices show no actionable buttons', async () => {
    const rendered = await renderComponent({ invoices: [{ ...invoice, status: 'void' }], organizationId: 'org-1', organizationName: 'Empresa Uno', onReload: jest.fn() });
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Sin acciones');
    expect(button(rendered.host, 'Anular')).toBeUndefined();
  });
});
