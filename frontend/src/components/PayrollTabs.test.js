import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PayrollNoveltiesTab from './PayrollNoveltiesTab';
import PayrollBenefitsTab from './PayrollBenefitsTab';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockApi = {
  listNovelties: jest.fn(), listContracts: jest.fn(), noveltyReference: jest.fn(), registerOvertime: jest.fn(), registerBonus: jest.fn(), decideNovelty: jest.fn(),
  benefitPreview: jest.fn(), downloadBenefit: jest.fn(), applyBenefit: jest.fn(), downloadSabana: jest.fn(),
};
const mockSave = jest.fn();

jest.mock('../api', () => ({ payrollAPI: new Proxy({}, { get: (_, name) => (...args) => mockApi[name](...args) }) }));
jest.mock('../lib/download', () => ({ saveBlob: (...a) => mockSave(...a) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./design', () => {
  const React = jest.requireActual('react');
  return {
    EmptyState: ({ title }) => React.createElement('div', null, title),
    LoadingState: () => React.createElement('div', null, 'Cargando'),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

const SCOPE = { organization_id: 'org_a' };
let container;
let root;

beforeEach(() => {
  mockApi.listNovelties.mockResolvedValue({ data: { items: [
    { novelty_id: 'n1', employee_name: 'Ana', type: 'overtime', kind_label: 'Hora extra diurna', hours: 2, date: '2026-10-07', amount: 20844, multiplier: 1.25, status: 'pending' },
    { novelty_id: 'n2', employee_name: 'Ana', type: 'bonus', concept: 'Bono de metas', amount: 100000, status: 'approved', applied_run_id: 'pay_1' },
  ] } });
  mockApi.listContracts.mockResolvedValue({ data: { items: [{ barber_id: 'b1', name: 'Ana', contract_type: 'fixed_salary' }, { barber_id: 'b2', name: 'Luis', contract_type: 'service_commission' }] } });
  mockApi.noveltyReference.mockResolvedValue({ data: { weekly_hours_limit: 42, sunday_surcharge: 0.9, max_overtime_per_day: 2, max_overtime_per_week: 12, kinds: { overtime_day: { label: 'Hora extra diurna', multiplier: 1.25 }, sunday_surcharge: { label: 'Recargo dominical o festivo', multiplier: 0.9 } } } });
  mockApi.registerOvertime.mockResolvedValue({ data: {} });
  mockApi.registerBonus.mockResolvedValue({ data: {} });
  mockApi.decideNovelty.mockResolvedValue({ data: {} });
  mockApi.benefitPreview.mockResolvedValue({ data: { label: 'Prima de servicios', deadline: 'Pagar a más tardar el 20 de diciembre de 2026', total: 791516, items: [{ barber_id: 'b1', name: 'Ana', months: [7, 8], amount: 791516 }] } });
  mockApi.downloadBenefit.mockResolvedValue({ data: new Blob(['x']), headers: {} });
  mockApi.downloadSabana.mockResolvedValue({ data: new Blob(['x']), headers: {} });
  mockApi.applyBenefit.mockResolvedValue({ data: { created: 1, skipped: 0 } });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function mount(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {});
}
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const click = async (el) => {
  await act(async () => {
    el.click();
  });
};

test('novelties: shows the legal reference, approves with one click and only fixed-contract staff are offered', async () => {
  await mount(<PayrollNoveltiesTab scope={SCOPE} />);
  expect(container.querySelector('[data-testid="novelty-reference"]').textContent).toContain('42 h semanales');
  expect(container.querySelector('[data-testid="novelty-reference"]').textContent).toContain('90%');
  const options = [...container.querySelectorAll('[data-testid="overtime-person"] option')].map((o) => o.textContent);
  expect(options).toEqual(['Selecciona', 'Ana']);
  await click(container.querySelector('[data-testid="approve-novelty"]'));
  expect(mockApi.decideNovelty).toHaveBeenCalledWith('n1', { approve: true }, SCOPE);
  expect(container.querySelector('[data-testid="novelty-history"]').textContent).toContain('ya en nómina');
});

test('novelties: registers overtime and a bonus', async () => {
  await mount(<PayrollNoveltiesTab scope={SCOPE} />);
  expect(container.querySelector('[data-testid="register-overtime"]').disabled).toBe(true);
  await setValue(container.querySelector('[data-testid="overtime-person"]'), 'b1');
  await setValue(container.querySelector('[data-testid="overtime-hours"]'), '2');
  await click(container.querySelector('[data-testid="register-overtime"]'));
  expect(mockApi.registerOvertime).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 'org_a', barber_id: 'b1', kind: 'overtime_day', hours: 2 }));
  await setValue(container.querySelector('[data-testid="bonus-person"]'), 'b1');
  await setValue(container.querySelector('[data-testid="bonus-concept"]'), 'Bono de metas');
  await setValue(container.querySelector('[data-testid="bonus-amount"]'), '150000');
  await click(container.querySelector('[data-testid="register-bonus"]'));
  expect(mockApi.registerBonus).toHaveBeenCalledWith({ organization_id: 'org_a', barber_id: 'b1', concept: 'Bono de metas', amount: 150000, constitutes_salary: false });
});

test('benefits: previews the accrued prima, downloads Excel, registers the payment and offers the yearly sheet', async () => {
  await mount(<PayrollBenefitsTab scope={SCOPE} />);
  expect(container.querySelector('[data-testid="benefits-note"]').textContent).toContain('ni para la UGPP');
  await click(container.querySelector('[data-testid="benefit-preview"]'));
  expect(mockApi.benefitPreview).toHaveBeenCalledWith('prima', expect.objectContaining({ organization_id: 'org_a', semester: expect.any(Number) }));
  expect(container.querySelector('[data-testid="benefit-result"]').textContent).toContain('20 de diciembre de 2026');
  expect(container.querySelector('[data-testid="benefit-total"]').textContent).toBe('$ 791.516');
  await click(container.querySelector('[data-testid="benefit-download"]'));
  expect(mockApi.downloadBenefit).toHaveBeenCalled();
  await click(container.querySelector('[data-testid="benefit-apply"]'));
  expect(mockApi.applyBenefit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'prima', organization_id: 'org_a' }));
  await click(container.querySelector('[data-testid="sabana-download"]'));
  expect(mockApi.downloadSabana).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 'org_a' }));
});

test('benefits: cesantias are consigned to the fund so they cannot be applied to payroll', async () => {
  await mount(<PayrollBenefitsTab scope={SCOPE} />);
  await setValue(container.querySelector('[data-testid="benefit-kind"]'), 'cesantias');
  await click(container.querySelector('[data-testid="benefit-preview"]'));
  expect(container.querySelector('[data-testid="benefit-apply"]')).toBeNull();
  expect(container.querySelector('[data-testid="benefit-result"]').textContent).toContain('se consignan al fondo');
  expect(mockApi.benefitPreview).toHaveBeenCalledWith('cesantias', { organization_id: 'org_a', year: expect.any(Number) });
});
