import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import InventoryLocationsTab from './InventoryLocationsTab';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockStock = jest.fn();
const mockOptions = jest.fn();
const mockItem = jest.fn();
const mockSave = jest.fn();

jest.mock('../api', () => ({
  inventoryAPI: {
    stockByLocation: (...args) => mockStock(...args),
    getLocationOptions: (...args) => mockOptions(...args),
    getItemLocations: (...args) => mockItem(...args),
    saveItemLocations: (...args) => mockSave(...args),
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./design', () => {
  const React = jest.requireActual('react');
  return {
    EmptyState: ({ title }) => React.createElement('div', { 'data-testid': 'empty' }, title),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

const ITEMS = [{ item_id: 'i1', sku: 'INV-1', name: 'Shampoo' }];
let container;
let root;

beforeEach(() => {
  mockStock.mockResolvedValue({
    data: {
      items: [{ item_id: 'i1', sku: 'INV-1', name: 'Shampoo', unit: 'unidades', warehouse: 'Bodega 1', location: 'Estante A', pallet: null, quantity: 6 }],
      total_units: 6,
      count: 1,
    },
  });
  mockOptions.mockResolvedValue({ data: { warehouses: ['Bodega 1'], locations: ['Estante A'], pallets: [] } });
  mockItem.mockResolvedValue({
    data: { item_id: 'i1', total_quantity: 10, assigned_quantity: 6, unassigned_quantity: 4, over_assigned: false, locations: [{ warehouse: 'Bodega 1', location: 'Estante A', pallet: null, quantity: 6 }] },
  });
  mockSave.mockResolvedValue({ data: {} });
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
    root.render(<InventoryLocationsTab organizationId="org_a" items={ITEMS} onChanged={jest.fn()} />);
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

test('lists the stock by location with the total and the filter options', async () => {
  await mount();
  expect(mockStock).toHaveBeenCalledWith({ organization_id: 'org_a' });
  const table = container.querySelector('[data-testid="stock-by-location-table"]');
  expect(table.textContent).toContain('Bodega 1');
  expect(table.textContent).toContain('Estante A');
  expect(container.querySelector('[data-testid="stock-by-location-total"]').textContent).toContain('6');
});

test('choosing a warehouse filter asks the server for that warehouse only', async () => {
  await mount();
  const warehouse = Array.from(container.querySelectorAll('select')).find((s) => s.textContent.includes('Bodega 1'));
  await setValue(warehouse, 'Bodega 1');
  expect(mockStock).toHaveBeenLastCalledWith({ organization_id: 'org_a', warehouse: 'Bodega 1' });
});

test('opening an item shows total, assigned and the unassigned remainder', async () => {
  await mount();
  await setValue(container.querySelector('[data-testid="location-item-select"]'), 'i1');
  expect(mockItem).toHaveBeenCalledWith('i1', { organization_id: 'org_a' });
  expect(container.querySelectorAll('[data-testid="location-row"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="unassigned-quantity"]').textContent).toBe('4');
});

test('saving sends optional fields as null and blocks when locations exceed the total', async () => {
  await mount();
  await setValue(container.querySelector('[data-testid="location-item-select"]'), 'i1');
  const quantity = container.querySelector('[data-testid="location-row"] input[type=number]');
  await setValue(quantity, '11');
  expect(container.querySelector('[data-testid="over-assigned"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="save-locations"]').disabled).toBe(true);
  await setValue(quantity, '7');
  expect(container.querySelector('[data-testid="over-assigned"]')).toBeNull();
  await act(async () => {
    container.querySelector('[data-testid="save-locations"]').click();
  });
  expect(mockSave).toHaveBeenCalledWith('i1', {
    organization_id: 'org_a',
    locations: [{ warehouse: 'Bodega 1', location: 'Estante A', pallet: null, quantity: 7 }],
  });
});
