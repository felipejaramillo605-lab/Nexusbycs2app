import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import InventoryCountsTab from './InventoryCountsTab';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockApi = {
  listCounts: jest.fn(),
  myCounts: jest.fn(),
  getCount: jest.fn(),
  reviewCount: jest.fn(),
  createCount: jest.fn(),
  assignCount: jest.fn(),
  requestRecount: jest.fn(),
  resolveCountTarget: jest.fn(),
  closeCount: jest.fn(),
};

jest.mock('../api', () => ({
  inventoryAPI: {
    listCounts: (...a) => mockApi.listCounts(...a),
    myCounts: (...a) => mockApi.myCounts(...a),
    getCount: (...a) => mockApi.getCount(...a),
    reviewCount: (...a) => mockApi.reviewCount(...a),
    createCount: (...a) => mockApi.createCount(...a),
    assignCount: (...a) => mockApi.assignCount(...a),
    requestRecount: (...a) => mockApi.requestRecount(...a),
    resolveCountTarget: (...a) => mockApi.resolveCountTarget(...a),
    closeCount: (...a) => mockApi.closeCount(...a),
  },
  teamAPI: { getMembers: () => Promise.resolve({ data: [{ user_id: 'u_ana', name: 'Ana', role: 'staff' }] }) },
}));
jest.mock('react-router-dom', () => ({ Link: ({ to, children }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./design', () => {
  const React = jest.requireActual('react');
  return {
    EmptyState: ({ title }) => React.createElement('div', null, title),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

const HEAD = {
  count_id: 'c1',
  count_number: 'CNT-2026-000001',
  name: 'Cierre',
  status: 'counting',
  target_total: 2,
  progress: { pending: 0, mismatch: 1, variance: 1, ok: 0, resolved: 0, dismissed: 0 },
  assignments: [{ assignment_id: 'a1', user_id: 'u_ana', user_name: 'Ana', expires_at: '2030-01-01T00:00:00+00:00', revoked: false }],
};
const ROW = (extra) => ({
  target_id: 't1', item_id: 'i1', sku: 'INV-1', name: 'Shampoo', unit: 'unidades', warehouse: null, location: null, pallet: null,
  system_quantity: 4, round: 1, resolution: null, status: 'variance', difference: -1, counted: { total: 3 }, discrepancies: [],
  counters: [{ user_id: 'u_ana', name: 'Ana', entries: [{ entry_id: 'e1', condition: 'good', quantity: 3 }] }], ...extra,
});

let container;
let root;

beforeEach(() => {
  mockApi.listCounts.mockResolvedValue({ data: { items: [{ count_id: 'c1', count_number: 'CNT-2026-000001', name: 'Cierre', status: 'counting' }] } });
  mockApi.myCounts.mockResolvedValue({ data: { items: [] } });
  mockApi.getCount.mockResolvedValue({ data: HEAD });
  mockApi.reviewCount.mockResolvedValue({
    data: { items: [ROW(), ROW({ target_id: 't2', item_id: 'i2', name: 'Gel', status: 'mismatch', difference: null, counted: null, discrepancies: [{ field: 'price' }] })] },
  });
  mockApi.resolveCountTarget.mockResolvedValue({ data: {} });
  mockApi.requestRecount.mockResolvedValue({ data: {} });
  mockApi.closeCount.mockResolvedValue({ data: {} });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<InventoryCountsTab organizationId="org_a" />);
  });
  await act(async () => {});
}

const click = async (element) => {
  await act(async () => {
    element.click();
  });
};

test('lists counts and opens one with its progress, mismatches and decisions needed', async () => {
  await mount();
  await click(container.querySelector('[data-testid="count-row"]'));
  expect(container.querySelector('[data-testid="count-progress"]').textContent).toContain('conteos distintos 1');
  expect(container.querySelector('[data-testid="attention"]').textContent).toContain('2 artículo');
  const rows = container.querySelectorAll('[data-testid="review-row"]');
  expect(rows).toHaveLength(2);
  expect(rows[1].textContent).toContain('Difieren en: precio de etiqueta');
});

test('a loss is defined with a comment and a recount can be requested', async () => {
  await mount();
  await click(container.querySelector('[data-testid="count-row"]'));
  await click(container.querySelector('[data-testid="loss-btn"]'));
  expect(mockApi.resolveCountTarget).toHaveBeenCalledWith('c1', 't1', { organization_id: 'org_a', resolution: 'loss', comment: '' });
  await click(container.querySelector('[data-testid="recount-btn"]'));
  expect(mockApi.requestRecount).toHaveBeenCalledWith('c1', 't1', { organization_id: 'org_a', note: null });
});

test('assigning needs a person and sends the access hours; closing asks the server to apply the count', async () => {
  await mount();
  await click(container.querySelector('[data-testid="count-row"]'));
  expect(container.querySelector('[data-testid="assign-btn"]').disabled).toBe(true);
  const select = container.querySelector('[data-testid="assign-user"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'u_ana');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(container.querySelector('[data-testid="assign-btn"]'));
  expect(mockApi.assignCount).toHaveBeenCalledWith('c1', { organization_id: 'org_a', user_id: 'u_ana', hours: 24 });
  await click(container.querySelector('[data-testid="close-count"]'));
  expect(mockApi.closeCount).toHaveBeenCalledWith('c1', { organization_id: 'org_a' });
});

test('shows the counts assigned to the current user with a link to the sheet', async () => {
  mockApi.myCounts.mockResolvedValue({ data: { items: [{ count_id: 'c9', count_number: 'CNT-2026-000009', name: 'Zona A', expires_at: '2030-01-01T00:00:00+00:00' }] } });
  await mount();
  expect(container.querySelector('[data-testid="my-counts"] a').getAttribute('href')).toBe('/inventory/count/c9');
});
