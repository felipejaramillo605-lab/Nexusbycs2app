import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerAuditLog from './OwnerAuditLog';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockListEvents = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../api', () => ({
  ownerAuditAPI: { listEvents: (...args) => mockListEvents(...args) },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    ResponsiveDataView: ({ items, columns, empty }) => (items.length ? React.createElement('div', null, items.map((item) => React.createElement('div', { key: item.audit_id }, columns.map((c) => React.createElement('span', { key: c.key }, c.render(item)))))) : empty),
    SegmentedControl: ({ options, value, onChange }) => React.createElement('div', null, options.map((o) => React.createElement('button', { key: o.value, type: 'button', 'aria-pressed': o.value === value, onClick: () => onChange(o.value) }, o.label))),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: Box,
  };
});

const event = (overrides = {}) => ({
  audit_id: 'paud_1',
  category: 'account',
  event_type: 'user_role_updated',
  actor_user_id: 'owner-1',
  organization_id: 'org-1',
  entity_type: 'user_account',
  entity_id: 'user-2',
  reason: null,
  created_at: '2026-09-28T12:00:00+00:00',
  ...overrides,
});

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OwnerAuditLog />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

describe('OwnerAuditLog', () => {
  let root;

  beforeEach(() => {
    mockListEvents.mockResolvedValue({ data: { items: [event()], page: 1, page_size: 25, total: 1, total_pages: 1, has_previous: false, has_next: false } });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('lists merged audit events on load', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    expect(mockListEvents).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 25 }));
    expect(rendered.host.textContent).toContain('user_role_updated');
    expect(rendered.host.textContent).toContain('Cuentas de usuario');
  });

  test('filtering by category resets to page 1 and passes the category through', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const billingButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent === 'Facturación');
    await act(async () => {
      billingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockListEvents).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'billing', page: 1 }));
  });

  test('shows an empty state when there are no events for the filter', async () => {
    mockListEvents.mockResolvedValue({ data: { items: [], page: 1, page_size: 25, total: 0, total_pages: 1, has_previous: false, has_next: false } });
    const rendered = await renderPage();
    root = rendered.root;

    expect(rendered.host.textContent).toContain('Sin eventos');
  });
});
