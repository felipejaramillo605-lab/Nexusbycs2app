import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SellerProfileCard from './SellerProfileCard';
import OperationalHealthCard from './OperationalHealthCard';
import PendingManagersCard from './PendingManagersCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetSellerProfile = jest.fn();
const mockSaveSellerProfile = jest.fn();
const mockGetOperationalHealth = jest.fn();
const mockGetUsers = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../api', () => ({
  platformBillingAPI: {
    getSellerProfile: (...args) => mockGetSellerProfile(...args),
    saveSellerProfile: (...args) => mockSaveSellerProfile(...args),
    getOperationalHealth: (...args) => mockGetOperationalHealth(...args),
  },
  ownerAPI: { getUsers: (...args) => mockGetUsers(...args) },
}));
jest.mock('../design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    EmptyState: ({ title }) => React.createElement('p', null, title),
    FieldGuide: ({ label }) => React.createElement('span', null, label),
    SurfaceCard: Box,
  };
});

async function renderComponent(Component, props = {}) {
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

describe('SellerProfileCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('loads the seller profile and saves edits', async () => {
    mockGetSellerProfile.mockResolvedValue({ data: { commercial_name: 'Nexus by CS2', invoice_prefix: 'NXS', legal_notice: 'Aviso' } });
    mockSaveSellerProfile.mockResolvedValue({ data: {} });
    const rendered = await renderComponent(SellerProfileCard);
    root = rendered.root;
    expect(mockGetSellerProfile).toHaveBeenCalledTimes(1);

    const submit = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('Guardar perfil fiscal'));
    await act(async () => {
      submit.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSaveSellerProfile).toHaveBeenCalledTimes(1);
  });
});

describe('OperationalHealthCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('renders the fetched operational health fields', async () => {
    mockGetOperationalHealth.mockResolvedValue({
      data: { smtp_configured: true, scheduler_enabled: false, lifecycle_mode: 'auto', delivery_mode: 'live', max_attempts: 3, automatic_enforcement_enabled: true, reminder_days: [3, 7], delivery_status_counts: { queued: 1, simulated: 0, sent: 5, failed: 0 } },
    });
    const rendered = await renderComponent(OperationalHealthCard);
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Configurado');
    expect(rendered.host.textContent).toContain('Desactivado');
    expect(rendered.host.textContent).toContain('3, 7 días');
  });
});

describe('PendingManagersCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('lists approved managers without an organization and links to onboarding', async () => {
    mockGetUsers.mockResolvedValue({ data: [{ user_id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'manager', access_status: 'approved', active: true, organization_id: null }] });
    const rendered = await renderComponent(PendingManagersCard);
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Ana');
    const button = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('Completar registro'));
    await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(mockNavigate).toHaveBeenCalledWith('/owner/organizations/new?manager_user_id=u1');
  });
});
