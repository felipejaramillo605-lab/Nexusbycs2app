import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StaffPaySlips from './StaffPaySlips';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockSlips = jest.fn();
const mockDownload = jest.fn();
const mockSave = jest.fn();

jest.mock('../api', () => ({ payrollAPI: { mySlips: (...a) => mockSlips(...a), downloadMySlip: (...a) => mockDownload(...a) } }));
jest.mock('../lib/download', () => ({ saveBlob: (...a) => mockSave(...a) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('./design', () => {
  const React = jest.requireActual('react');
  return { SurfaceCard: ({ children }) => React.createElement('section', null, children) };
});

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
    root.render(<StaffPaySlips />);
  });
  await act(async () => {});
}

test('shows nothing when the professional has no approved pay slips', async () => {
  mockSlips.mockResolvedValue({ data: { items: [] } });
  await mount();
  expect(container.querySelector('[data-testid="staff-payslips"]')).toBeNull();
});

test('lists fixed and commission slips and downloads the chosen one', async () => {
  mockSlips.mockResolvedValue({
    data: { items: [
      { run_id: 'p1', number: 'NOM-2026-10', label: 'Octubre de 2026', net_pay: 1859800, contract_type: 'fixed_salary', version: 2 },
      { run_id: 'p2', number: 'NOM-2026-09', label: 'Septiembre de 2026', commission_total: 800000, contract_type: 'service_commission', version: 1 },
    ] },
  });
  mockDownload.mockResolvedValue({ data: new Blob(['x']), headers: {} });
  await mount();
  const rows = container.querySelectorAll('[data-testid="payslip-row"]');
  expect(rows[0].textContent).toContain('Neto pagado: $ 1.859.800');
  expect(rows[0].textContent).toContain('corregida (v2)');
  expect(rows[1].textContent).toContain('Honorarios por servicio: $ 800.000');
  await act(async () => {
    rows[0].querySelector('button').click();
  });
  expect(mockDownload).toHaveBeenCalledWith('p1');
  expect(mockSave).toHaveBeenCalled();
});
