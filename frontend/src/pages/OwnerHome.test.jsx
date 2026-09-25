import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerHome from './OwnerHome';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockToastError = jest.fn();
const mockGetAll = jest.fn();
const mockGetUsers = jest.fn();
const mockOwnerList = jest.fn();
const mockGetOperationalHealth = jest.fn();

jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => require('react').createElement('a', { href: to, ...props }, children) }), { virtual: true });
jest.mock('sonner', () => ({ toast: { error: (...args) => mockToastError(...args) } }));
jest.mock('../api', () => ({
  organizationAPI: { getAll: (...args) => mockGetAll(...args) },
  ownerAPI: { getUsers: (...args) => mockGetUsers(...args) },
  supportAPI: { ownerList: (...args) => mockOwnerList(...args) },
  platformBillingAPI: { getOperationalHealth: (...args) => mockGetOperationalHealth(...args) },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    AdminShell: Box, MotionPage: Box, SurfaceCard: Box,
    LoadingState: ({ label }) => React.createElement('div', null, label),
    MetricCard: ({ label, value }) => React.createElement('div', null, `${label}: ${value}`),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
  };
});

async function renderComponent() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OwnerHome />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

async function cleanup(root) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
  jest.clearAllMocks();
}

describe('OwnerHome', () => {
  let root;
  afterEach(() => cleanup(root));

  test('renders real counts from existing endpoints, not fabricated ones', async () => {
    mockGetAll.mockResolvedValue({ data: [{ organization_id: 'org-1' }, { organization_id: 'org-2' }] });
    mockGetUsers.mockResolvedValue({
      data: [
        { user_id: 'u1', role: 'manager', access_status: 'pending' },
        { user_id: 'u2', role: 'manager', access_status: 'approved', active: true, organization_id: null },
        { user_id: 'u3', role: 'manager', access_status: 'approved', active: true, organization_id: 'org-1' },
      ],
    });
    mockOwnerList.mockResolvedValue({ data: { total: 3 } });
    mockGetOperationalHealth.mockResolvedValue({ data: { delivery_status_counts: { failed: 2 } } });

    const rendered = await renderComponent();
    root = rendered.root;

    expect(mockOwnerList).toHaveBeenCalledWith({ status: 'waiting_owner', page_size: 1 });
    expect(rendered.host.textContent).toContain('Organizaciones: 2');
    expect(rendered.host.textContent).toContain('Accesos pendientes: 1');
    expect(rendered.host.textContent).toContain('Managers sin organización: 1');
    expect(rendered.host.textContent).toContain('PQRS esperando respuesta: 3');
    expect(rendered.host.textContent).toContain('2 entregas fallidas registradas.');
    expect(rendered.host.textContent).not.toMatch(/\$\s*\d/);
  });

  test('shows a toast and no crash when a summary call fails', async () => {
    mockGetAll.mockRejectedValue({ response: { data: { detail: 'boom' } } });
    mockGetUsers.mockResolvedValue({ data: [] });
    mockOwnerList.mockResolvedValue({ data: { total: 0 } });
    mockGetOperationalHealth.mockResolvedValue({ data: {} });

    const rendered = await renderComponent();
    root = rendered.root;

    expect(mockToastError).toHaveBeenCalledWith('boom');
  });
});
