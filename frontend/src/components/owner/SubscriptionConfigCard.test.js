import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SubscriptionConfigCard from './SubscriptionConfigCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockSave = jest.fn();
const mockCreateInvoice = jest.fn();
const mockGetCatalog = jest.fn();

const CATALOG_PLANS = [
  { plan_code: 'standard', name: 'Membresía Estándar', monthly_amount_minor: 8000000, currency: 'COP' },
  { plan_code: 'premium', name: 'Membresía Premium', monthly_amount_minor: 15000000, currency: 'COP' },
];

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../api', () => ({
  subscriptionAPI: {
    save: (...args) => mockSave(...args),
    createInvoice: (...args) => mockCreateInvoice(...args),
    getBillingCatalog: (...args) => mockGetCatalog(...args),
  },
}));
jest.mock('../design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    FieldGuide: ({ label }) => React.createElement('span', null, label),
    SurfaceCard: Box,
  };
});

const subscription = { plan_code: 'nexus_monthly', monthly_amount_minor: 15000000, currency: 'COP', billing_day: 5, status: 'active', contract_term: 'monthly', trial_days: 0 };

async function renderComponent(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<SubscriptionConfigCard {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

async function rerender(root, host, props) {
  await act(async () => {
    root.render(<SubscriptionConfigCard {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

async function cleanup(root) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
  jest.clearAllMocks();
}

const submitForm = (host, buttonLabel) => act(async () => {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent.includes(buttonLabel));
  button.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const setValue = async (element, value) => act(async () => {
  const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('SubscriptionConfigCard', () => {
  let root;
  beforeEach(() => mockGetCatalog.mockResolvedValue({ data: { plans: CATALOG_PLANS } }));
  afterEach(() => cleanup(root));

  test('populates the subscription form from the prop and saves with centavos conversion', async () => {
    const onReload = jest.fn().mockResolvedValue();
    mockSave.mockResolvedValue({ data: {} });
    const rendered = await renderComponent({ subscription, organizationId: 'org-1', onReload });
    root = rendered.root;

    // nexus_monthly is a legacy code, not in the catalog, so it surfaces as
    // its own "código heredado" option on the plan <select> rather than a
    // free-text input.
    const planSelect = rendered.host.querySelectorAll('select')[0];
    expect(planSelect.value).toBe('nexus_monthly');
    const amountInput = rendered.host.querySelector('input[value="150000"]');
    expect(amountInput).toBeTruthy(); // 15,000,000 minor units -> 150000 pesos, displayed
    expect(amountInput.disabled).toBe(false); // legacy plan: price stays editable

    await submitForm(rendered.host, 'Guardar suscripción');
    expect(mockSave).toHaveBeenCalledWith('org-1', expect.objectContaining({
      plan_code: 'nexus_monthly',
      monthly_amount_minor: 15000000,
      currency: 'COP',
      billing_day: 5,
      status: 'active',
    }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test('does not overwrite the form when the organization has no subscription yet', async () => {
    const rendered = await renderComponent({ subscription: null, organizationId: 'org-2', onReload: jest.fn() });
    root = rendered.root;
    // Falls back to the built-in defaults, not a blank form -- matches the
    // original `if (s.data) setForm(...)` behavior exactly. Defaults now
    // point at the catalog's "standard" plan instead of a free-text code.
    expect(rendered.host.querySelectorAll('select')[0].value).toBe('standard');
    expect(rendered.host.querySelector('input[value="80000"]')).toBeTruthy();
  });

  test('resyncs the form when switching to a different organization with its own subscription', async () => {
    const rendered = await renderComponent({ subscription, organizationId: 'org-1', onReload: jest.fn() });
    root = rendered.root;
    const other = { ...subscription, plan_code: 'nexus_annual', monthly_amount_minor: 20000000 };
    await rerender(root, rendered.host, { subscription: other, organizationId: 'org-2', onReload: jest.fn() });
    expect(rendered.host.querySelectorAll('select')[0].value).toBe('nexus_annual');
    expect(rendered.host.querySelector('input[value="200000"]')).toBeTruthy();
  });

  test('selecting a catalog plan auto-fills the price and locks it from manual editing', async () => {
    const rendered = await renderComponent({ subscription, organizationId: 'org-1', onReload: jest.fn() });
    root = rendered.root;
    const planSelect = rendered.host.querySelectorAll('select')[0];

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(planSelect, 'premium');
      planSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Premium catalog price: 15,000,000 minor -> 150000 pesos, and the field
    // locks because the backend rejects a mismatch against the catalog price.
    const amountInput = rendered.host.querySelector('input[value="150000"]');
    expect(amountInput).toBeTruthy();
    expect(amountInput.disabled).toBe(true);
  });

  test('emits an invoice with the discount applied and does not reset the draft after success', async () => {
    const onReload = jest.fn().mockResolvedValue();
    mockCreateInvoice.mockResolvedValue({ data: {} });
    const rendered = await renderComponent({ subscription, organizationId: 'org-1', onReload });
    root = rendered.root;

    const discountInput = rendered.host.querySelector('input[value="0"]');
    await setValue(discountInput, '20000');
    // Amount auto-recomputes from form.monthly_amount (150000) - discount (20000) = 130000.
    expect(rendered.host.querySelector('input[value="130000"]')).toBeTruthy();

    await submitForm(rendered.host, 'Emitir factura');
    expect(mockCreateInvoice).toHaveBeenCalledWith('org-1', expect.objectContaining({
      amount_minor: 13000000,
      discount_minor: 2000000,
      currency: 'COP',
    }));
    expect(onReload).toHaveBeenCalledTimes(1);
    // Draft survives the successful submission -- original never reset `invoice`.
    expect(rendered.host.querySelector('input[value="130000"]')).toBeTruthy();
  });

  test('the invoice submit button is disabled while there is no subscription', async () => {
    const rendered = await renderComponent({ subscription: null, organizationId: 'org-1', onReload: jest.fn() });
    root = rendered.root;
    const button = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('Emitir factura'));
    expect(button.disabled).toBe(true);
  });
});
