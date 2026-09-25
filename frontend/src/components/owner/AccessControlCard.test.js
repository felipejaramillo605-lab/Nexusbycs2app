import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AccessControlCard from './AccessControlCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockBlock = jest.fn();
const mockReactivate = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../api', () => ({
  subscriptionAPI: {
    blockOrganization: (...args) => mockBlock(...args),
    reactivateOrganization: (...args) => mockReactivate(...args),
  },
}));
jest.mock('../design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    AccessibleModal: ({ children, labelledBy, role = 'dialog' }) => React.createElement('div', { role, 'aria-labelledby': labelledBy }, children),
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    SurfaceCard: Box,
  };
});

async function renderComponent(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<AccessControlCard {...props} />);
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

describe('AccessControlCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('blocks the organization with a valid reason and a stable idempotency key on retry', async () => {
    const onReload = jest.fn().mockResolvedValue();
    const rendered = await renderComponent({
      subscription: { manual_access_blocked: false },
      pending: [{ invoice_id: 'inv-1', amount_minor: 10000 }],
      organizationId: 'org-1',
      organizationName: 'Empresa Uno',
      onReload,
    });
    root = rendered.root;

    await act(async () => button(rendered.host, 'Bloquear organización').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(rendered.host.querySelector('[role="alertdialog"]')).toBeTruthy();

    const reason = rendered.host.querySelector('[role="alertdialog"] textarea');
    await change(reason, 'Cliente con mora prolongada');
    const confirm = () => [...rendered.host.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent.includes('Bloquear organización'));

    mockBlock.mockRejectedValueOnce(new Error('network timeout')).mockResolvedValueOnce({ data: {} });
    // First attempt fails (e.g. network blip); retry must reuse the same key.
    await act(async () => {
      confirm().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      confirm().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockBlock).toHaveBeenCalledTimes(2);
    const firstKey = mockBlock.mock.calls[0][1].idempotency_key;
    const retryKey = mockBlock.mock.calls[1][1].idempotency_key;
    expect(firstKey).toBe(retryKey);
    expect(mockBlock).toHaveBeenLastCalledWith('org-1', { reason: 'Cliente con mora prolongada', idempotency_key: retryKey });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test('block button is disabled with no pending balance', async () => {
    const rendered = await renderComponent({
      subscription: { manual_access_blocked: false },
      pending: [],
      organizationId: 'org-1',
      organizationName: 'Empresa Uno',
      onReload: jest.fn(),
    });
    root = rendered.root;
    expect(button(rendered.host, 'Bloquear organización').disabled).toBe(true);
  });

  test('reactivating with open debt requires the override checkbox', async () => {
    const onReload = jest.fn().mockResolvedValue();
    const rendered = await renderComponent({
      subscription: { manual_access_blocked: true },
      pending: [{ invoice_id: 'inv-1', amount_minor: 5000 }],
      organizationId: 'org-1',
      organizationName: 'Empresa Uno',
      onReload,
    });
    root = rendered.root;

    await act(async () => button(rendered.host, 'Reactivar organización').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await change(rendered.host.querySelector('[role="alertdialog"] textarea'), 'Pago acordado con el cliente');

    const confirmButtons = [...rendered.host.querySelectorAll('[role="alertdialog"] button')].filter((b) => b.textContent.includes('Reactivar organización'));
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    expect(confirmButton.disabled).toBe(true);

    const checkbox = rendered.host.querySelector('input[type="checkbox"]');
    await act(async () => {
      checkbox.click();
    });
    expect(confirmButton.disabled).toBe(false);

    mockReactivate.mockResolvedValue({ data: {} });
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockReactivate).toHaveBeenCalledWith('org-1', expect.objectContaining({ override_open_debt: true, reason: 'Pago acordado con el cliente' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test('reactivating with no pending balance does not require the override checkbox', async () => {
    const onReload = jest.fn().mockResolvedValue();
    mockReactivate.mockResolvedValue({ data: {} });
    const rendered = await renderComponent({
      subscription: { manual_access_blocked: true },
      pending: [],
      organizationId: 'org-1',
      organizationName: 'Empresa Uno',
      onReload,
    });
    root = rendered.root;

    await act(async () => button(rendered.host, 'Reactivar organización').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(rendered.host.querySelector('input[type="checkbox"]')).toBeNull();
    await change(rendered.host.querySelector('[role="alertdialog"] textarea'), 'Sin saldo pendiente, reactivación directa');

    const confirmButtons = [...rendered.host.querySelectorAll('[role="alertdialog"] button')].filter((b) => b.textContent.includes('Reactivar organización'));
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    expect(confirmButton.disabled).toBe(false);
    await act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockReactivate).toHaveBeenCalledWith('org-1', expect.objectContaining({ override_open_debt: false }));
  });

  test('rejects a reason shorter than 3 characters via the disabled confirm button', async () => {
    const rendered = await renderComponent({
      subscription: { manual_access_blocked: false },
      pending: [{ invoice_id: 'inv-1', amount_minor: 5000 }],
      organizationId: 'org-1',
      organizationName: 'Empresa Uno',
      onReload: jest.fn(),
    });
    root = rendered.root;
    await act(async () => button(rendered.host, 'Bloquear organización').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await change(rendered.host.querySelector('[role="alertdialog"] textarea'), 'ok');
    const confirmButtons = [...rendered.host.querySelectorAll('[role="alertdialog"] button')].filter((b) => b.textContent.includes('Bloquear organización'));
    expect(confirmButtons[confirmButtons.length - 1].disabled).toBe(true);
    expect(mockBlock).not.toHaveBeenCalled();
  });
});
