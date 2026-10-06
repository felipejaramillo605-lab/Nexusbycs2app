import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SettlementsDashboard from './SettlementsDashboard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockContracts = jest.fn();

jest.mock('../api', () => ({
  settlementAPI: {
    getPending: () => Promise.resolve({ data: [{ barber_id: 'b1', staff_name: 'Ana', transaction_count: 3, total_amount: 120000, commission_amount: 100000, tip_amount: 20000 }, { barber_id: 'b2', staff_name: 'Luis', transaction_count: 1, total_amount: 50000, commission_amount: 50000, tip_amount: 0 }] }),
    getAll: () => Promise.resolve({ data: { items: [{ settlement_id: 's1', barber_id: 'b1', staff_name_snapshot: 'Ana', status: 'draft', total_amount: 90000, period_start: '2026-09-01', period_end: '2026-09-30', transaction_count: 2 }], page: 1, page_size: 20, total: 1, total_pages: 1 } }),
    create: jest.fn(),
    getById: jest.fn(),
  },
  settlementWorkflowAPI: { approve: jest.fn(), pay: jest.fn(), cancel: jest.fn() },
  payrollAPI: { listContracts: (...args) => mockContracts(...args) },
}));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org_a' } }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => ({ AccessibleModal: ({ children }) => <div>{children}</div> }));

let container;
let root;

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
    root.render(<SettlementsDashboard />);
  });
  await act(async () => {});
}

test('shows each professional contract type next to the name and points fixed contracts to Payroll', async () => {
  mockContracts.mockResolvedValue({ data: { items: [{ barber_id: 'b1', contract_type: 'service_commission' }, { barber_id: 'b2', contract_type: 'fixed_salary' }] } });
  await mount();
  const badges = [...container.querySelectorAll('[data-testid="contract-badge"]')].map((el) => el.textContent);
  expect(badges).toEqual(expect.arrayContaining(['Por servicio', 'Fijo']));
  expect(container.querySelector('[data-testid="settlements-payroll-note"]').textContent).toContain('contrato por servicio');
  await act(async () => {
    container.querySelector('[data-testid="go-payroll"]').click();
  });
  expect(mockNavigate).toHaveBeenCalledWith('/manager/payroll');
});

test('still works when contracts cannot be loaded', async () => {
  mockContracts.mockRejectedValue(new Error('offline'));
  await mount();
  expect(container.textContent).toContain('Ana');
  expect(container.querySelector('[data-testid="contract-badge"]')).toBeNull();
});
