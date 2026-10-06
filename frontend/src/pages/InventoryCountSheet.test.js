import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import InventoryCountSheet from './InventoryCountSheet';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockSheet = jest.fn();
const mockAdd = jest.fn();
const mockSubmit = jest.fn();

jest.mock('../api', () => ({
  inventoryAPI: {
    getCountSheet: (...a) => mockSheet(...a),
    addCountEntry: (...a) => mockAdd(...a),
    updateCountEntry: jest.fn(),
    deleteCountEntry: jest.fn(),
    submitCount: (...a) => mockSubmit(...a),
  },
}));
jest.mock('react-router-dom', () => ({ Link: ({ to, children }) => <a href={to}>{children}</a>, useParams: () => ({ countId: 'c1' }) }), { virtual: true });
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const SHEET = (extra = {}) => ({
  count_id: 'c1',
  count_number: 'CNT-2026-000001',
  name: 'Zona A',
  blind_count: true,
  expires_at: '2030-01-01T00:00:00+00:00',
  submitted_at: null,
  items: [
    { target_id: 't1', item_id: 'i1', sku: 'INV-1', name: 'Shampoo', unit: 'unidades', warehouse: 'Bodega 1', location: 'Estante A', pallet: null, round: 1, recount_requested: false, entries: [] },
  ],
  ...extra,
});

let container;
let root;

beforeEach(() => {
  mockSheet.mockResolvedValue({ data: SHEET() });
  mockAdd.mockResolvedValue({ data: {} });
  mockSubmit.mockResolvedValue({ data: {} });
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
    root.render(<InventoryCountSheet />);
  });
  await act(async () => {});
}

const setValue = async (element, value) => {
  const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};

test('counting an item prefills its place and never shows the system quantity in a blind count', async () => {
  await mount();
  expect(container.textContent).not.toContain('Sistema:');
  await setValue(container.querySelector('[data-testid="sheet-target"]'), 't1');
  await setValue(container.querySelector('[data-testid="sheet-quantity"]'), '5');
  await act(async () => {
    container.querySelector('[data-testid="sheet-save"]').click();
  });
  expect(mockAdd).toHaveBeenCalledWith('c1', {
    item_id: 'i1', condition: 'good', quantity: 5, warehouse: 'Bodega 1', location: 'Estante A', pallet: null, label_price: null, code: null,
  });
});

test('sending is blocked until something was counted and locks the sheet afterwards', async () => {
  mockSheet.mockResolvedValue({ data: SHEET({ items: [{ ...SHEET().items[0], entries: [{ entry_id: 'e1', condition: 'good', quantity: 5, submitted: false }] }] }) });
  await mount();
  expect(container.querySelectorAll('[data-testid="sheet-item"]')).toHaveLength(1);
  await act(async () => {
    container.querySelector('[data-testid="sheet-submit"]').click();
  });
  expect(mockSubmit).toHaveBeenCalledWith('c1');
});

test('a submitted sheet hides the form and a recount request is announced', async () => {
  mockSheet.mockResolvedValue({ data: SHEET({ submitted_at: '2026-10-05T10:00:00+00:00' }) });
  await mount();
  expect(container.querySelector('[data-testid="submitted-note"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="sheet-target"]')).toBeNull();
});

test('shows a clear message when the temporary access is gone', async () => {
  mockSheet.mockRejectedValue({ response: { data: { detail: { code: 'COUNT_ACCESS_EXPIRED', message: 'Tu acceso a este conteo venció o fue retirado.' } } } });
  await mount();
  expect(container.querySelector('[data-testid="count-error"]').textContent).toContain('venció');
});
