import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import DeliveryMonitoringCard from './DeliveryMonitoringCard';
import BackfillCard from './BackfillCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockRetry = jest.fn();
const mockBackfill = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../api', () => ({
  deliveryOperationsAPI: {
    retry: (...args) => mockRetry(...args),
    backfill: (...args) => mockBackfill(...args),
  },
}));
jest.mock('../design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    AccessibleModal: ({ children, labelledBy, role = 'dialog' }) => React.createElement('div', { role, 'aria-labelledby': labelledBy }, children),
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    EmptyState: ({ title }) => React.createElement('p', null, title),
    FieldGuide: ({ label }) => React.createElement('span', null, label),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: Box,
  };
});

async function renderComponent(Component, props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<Component {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

async function cleanup(root) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
  jest.clearAllMocks();
}

const button = (host, label) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(label));
const change = async (element, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('DeliveryMonitoringCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('retries a failed delivery with the controlled recipient', async () => {
    const onReload = jest.fn().mockResolvedValue();
    const deliveries = [{ email_delivery_id: 'd1', invoice_number: 'NXS-1', status: 'failed', attempt_count: 2 }];
    const rendered = await renderComponent(DeliveryMonitoringCard, { deliveries, onReload });
    root = rendered.root;

    const recipientInput = rendered.host.querySelector('input[type="email"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(recipientInput, 'qa@example.com');
      recipientInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    mockRetry.mockResolvedValue({});
    await act(async () => {
      button(rendered.host, 'Reintentar').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRetry).toHaveBeenCalledWith('d1', { test_recipient: 'qa@example.com' });
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});

describe('BackfillCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('requires an explicit confirmation and a valid reason before applying', async () => {
    const onReload = jest.fn().mockResolvedValue();
    mockBackfill.mockResolvedValueOnce({ data: { items: [{ invoice_id: 'inv-old' }] } });
    const rendered = await renderComponent(BackfillCard, { organizationId: 'org-1', onReload });
    root = rendered.root;

    await act(async () => {
      button(rendered.host, 'Diagnóstico dry-run').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockBackfill).toHaveBeenCalledWith({ organization_id: 'org-1', apply: false });

    await act(async () => button(rendered.host, 'Aplicar backfill').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(rendered.host.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(mockBackfill).toHaveBeenCalledTimes(1);

    mockBackfill.mockResolvedValueOnce({ data: {} });
    const reason = rendered.host.querySelector('[role="alertdialog"] textarea');
    await change(reason, 'Documento revisado y aprobado');
    await act(async () => {
      button(rendered.host, 'Confirmar backfill').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockBackfill).toHaveBeenLastCalledWith({ organization_id: 'org-1', apply: true, reason: 'Documento revisado y aprobado' });
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
