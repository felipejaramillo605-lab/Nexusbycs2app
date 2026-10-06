import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PayrollPage from './PayrollPage';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockApi = {
  getSettings: jest.fn(),
  saveSettings: jest.fn(),
  listExtras: jest.fn(),
  createExtra: jest.fn(),
  updateExtra: jest.fn(),
  deleteExtra: jest.fn(),
  listContracts: jest.fn(),
  saveContract: jest.fn(),
  listRuns: jest.fn(),
  createRun: jest.fn(),
  getRun: jest.fn(),
  saveLine: jest.fn(),
  approve: jest.fn(),
  reopen: jest.fn(),
  downloadReport: jest.fn(),
  downloadSlip: jest.fn(),
};
const mockSave = jest.fn();

jest.mock('../api', () => ({ payrollAPI: new Proxy({}, { get: (_, name) => (...args) => mockApi[name](...args) }) }));
jest.mock('../lib/download', () => ({ saveBlob: (...args) => mockSave(...args) }));
jest.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org_a' } }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const box = (tag) => ({ children, label, value }) => React.createElement(tag, null, label, value, children);
  return {
    AccessibleModal: ({ children }) => React.createElement('div', { role: 'dialog' }, children),
    EmptyState: ({ title }) => React.createElement('div', null, title),
    LoadingState: () => React.createElement('div', null, 'Cargando'),
    MetricCard: box('div'),
    MotionPage: box('div'),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    SegmentedControl: ({ options, onChange }) => React.createElement('nav', null, options.map((o) => React.createElement('button', { key: o.value, type: 'button', 'data-tab': o.value, onClick: () => onChange(o.value) }, o.label))),
    SurfaceCard: box('section'),
  };
});

const COMPUTED = { days_worked: 30, period_days: 30, gross: 2000000, deductions_total: 140200, net_pay: 1859800, employer_cost: 2600000, notes: ['Empleador exonerado de salud, SENA e ICBF (art. 114-1 E.T.) por salario menor a 10 SMMLV.'] };
const RUN = {
  run_id: 'pay_1', number: 'NOM-2026-10', year: 2026, month: 10, frequency: 'monthly', half: null, status: 'draft', version: 1,
  totals: { net: 1859800, deductions: 140200, employer: 300000, provisions: 400000, commissions: 800000, total_personnel_cost: 3400000 },
  lines: [
    { barber_id: 'b1', name: 'Ana', contract_type: 'fixed_salary', computed: COMPUTED, adjustments: [] },
    { barber_id: 'b2', name: 'Luis', contract_type: 'service_commission', computed: null, settlement_total: 800000 },
  ],
  corrections: [],
};

let container;
let root;
const SCOPE = { organization_id: 'org_a' };

beforeEach(() => {
  mockApi.listRuns.mockResolvedValue({ data: { items: [{ ...RUN, lines: undefined }] } });
  mockApi.getRun.mockResolvedValue({ data: RUN });
  mockApi.createRun.mockResolvedValue({ data: RUN });
  mockApi.saveLine.mockResolvedValue({ data: RUN });
  mockApi.approve.mockResolvedValue({ data: { ...RUN, status: 'approved' } });
  mockApi.reopen.mockResolvedValue({ data: { ...RUN, version: 2 } });
  mockApi.downloadReport.mockResolvedValue({ data: new Blob(['x']), headers: {} });
  mockApi.downloadSlip.mockResolvedValue({ data: new Blob(['x']), headers: {} });
  mockApi.listContracts.mockResolvedValue({ data: { items: [{ barber_id: 'b1', name: 'Ana', contract_type: 'service_commission', pay_frequency: 'monthly' }] } });
  mockApi.getSettings.mockResolvedValue({ data: { exonerated: true, default_arl_class: 'I', params_overrides: {}, params: { year: 2026, smmlv: 1750905, transport_aid: 249095 }, risk_classes: { I: 'Riesgo I', II: 'Riesgo II' }, disclaimer: 'No reemplaza un software de nómina.' } });
  mockApi.listExtras.mockResolvedValue({ data: { items: [{ extra_id: 'e1', name: 'Auxilio de internet', kind: 'fixed', value: 50000, constitutes_salary: false, applies_to: 'all', barber_ids: [], active: true }] } });
  mockApi.createExtra.mockResolvedValue({ data: {} });
  mockApi.deleteExtra.mockResolvedValue({ data: {} });
  mockApi.saveContract.mockResolvedValue({ data: {} });
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
    root.render(<PayrollPage />);
  });
  await act(async () => {});
}
const click = async (el) => {
  await act(async () => {
    el.click();
  });
};
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const tab = (name) => container.querySelector(`[data-tab="${name}"]`);

test('always states that it does not replace a payroll software', async () => {
  await mount();
  expect(container.querySelector('[data-testid="payroll-disclaimer"]').textContent).toContain('No reemplaza un software de nómina');
});

test('creates a run, opens it and shows the breakdown, notes and per-employee actions', async () => {
  await mount();
  await click(container.querySelector('[data-testid="create-run"]'));
  expect(mockApi.createRun).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 'org_a', frequency: 'monthly', half: null }));
  const detail = container.querySelector('[data-testid="run-detail"]');
  expect(detail.textContent).toContain('NOM-2026-10');
  expect(detail.textContent).toContain('Costo total de personal');
  expect(detail.textContent).toContain('Empleador exonerado');
  const rows = detail.querySelectorAll('tbody tr');
  expect(rows[0].textContent).toContain('Fijo (salario)');
  expect(rows[1].textContent).toContain('Por servicio');
  expect(rows[1].querySelector('[data-testid="edit-line"]')).toBeNull(); // contrato por servicio: sin novedades de nomina
});

test('downloads the Excel report and the pay slip', async () => {
  await mount();
  await click(container.querySelector('[data-testid="run-row"]'));
  await click(container.querySelector('[data-testid="download-report"]'));
  expect(mockApi.downloadReport).toHaveBeenCalledWith('pay_1', SCOPE);
  expect(mockSave).toHaveBeenCalled();
  const slip = [...container.querySelectorAll('[data-testid="run-lines"] button')].find((b) => b.textContent.includes('Colilla'));
  await click(slip);
  expect(mockApi.downloadSlip).toHaveBeenCalledWith('pay_1', 'b1', SCOPE);
});

test('a draft run can have days and adjustments corrected, and approved runs need a reason to reopen', async () => {
  await mount();
  await click(container.querySelector('[data-testid="run-row"]'));
  await click(container.querySelector('[data-testid="edit-line"]'));
  await setValue(container.querySelector('[data-testid="line-days"]'), '20');
  await click(container.querySelector('[data-testid="add-adjustment"]'));
  const row = container.querySelector('[data-testid="adjustment-row"]');
  await setValue(row.querySelector('input'), 'Préstamo');
  await setValue(row.querySelector('select'), 'deduction');
  await setValue(row.querySelectorAll('input')[1], '50000');
  await click(container.querySelector('[data-testid="save-line"]'));
  expect(mockApi.saveLine).toHaveBeenCalledWith('pay_1', 'b1', { days_worked: 20, adjustments: [{ label: 'Préstamo', kind: 'deduction', amount: 50000, constitutes_salary: false }] }, SCOPE);

  await click(container.querySelector('[data-testid="approve-run"]'));
  expect(mockApi.approve).toHaveBeenCalledWith('pay_1', SCOPE);
  await click(container.querySelector('[data-testid="reopen-run"]'));
  expect(container.querySelector('[data-testid="confirm-reopen"]').disabled).toBe(true);
  await setValue(container.querySelector('[data-testid="reopen-reason"]'), 'Faltó un descuento');
  await click(container.querySelector('[data-testid="confirm-reopen"]'));
  expect(mockApi.reopen).toHaveBeenCalledWith('pay_1', { reason: 'Faltó un descuento' }, SCOPE);
});

test('contracts: a fixed contract can be set to the minimum wage and saved', async () => {
  await mount();
  await click(tab('contracts'));
  await click(container.querySelector('[data-testid="edit-contract"]'));
  await setValue(container.querySelector('[data-testid="contract-type"]'), 'fixed_salary');
  const useMinimum = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Usar salario mínimo'));
  await click(useMinimum);
  expect(container.querySelector('[data-testid="contract-salary"]').value).toBe('1750905');
  await click(container.querySelector('[data-testid="save-contract"]'));
  expect(mockApi.saveContract).toHaveBeenCalledWith('b1', expect.objectContaining({ contract_type: 'fixed_salary', base_salary: 1750905, pay_frequency: 'monthly', arl_risk_class: 'I' }));
});

test('extras: create with a percent of the basic salary and delete', async () => {
  await mount();
  await click(tab('extras'));
  expect(container.querySelector('[data-testid="extra-row"]').textContent).toContain('Auxilio de internet');
  await click(container.querySelector('[data-testid="new-extra"]'));
  await setValue(container.querySelector('[data-testid="extra-name"]'), 'Rodamiento');
  await setValue(container.querySelector('[data-testid="extra-kind"]'), 'percent');
  await setValue(container.querySelector('[data-testid="extra-value"]'), '8');
  await click(container.querySelector('[data-testid="save-extra"]'));
  expect(mockApi.createExtra).toHaveBeenCalledWith(expect.objectContaining({ name: 'Rodamiento', kind: 'percent', value: 8, constitutes_salary: false, applies_to: 'all' }));
  await click(container.querySelector('[data-testid="delete-extra"]'));
  expect(mockApi.deleteExtra).toHaveBeenCalledWith('e1', SCOPE);
});

test('settings: saves the legal parameters for the current year with the exoneration flag', async () => {
  await mount();
  await click(tab('settings'));
  await setValue(container.querySelector('[data-testid="param-smmlv"]'), '1800000');
  await click(container.querySelector('[data-testid="save-settings"]'));
  expect(mockApi.saveSettings).toHaveBeenCalledWith({ organization_id: 'org_a', exonerated: true, default_arl_class: 'I', params_overrides: { 2026: { smmlv: 1800000, transport_aid: 249095 } } });
});
