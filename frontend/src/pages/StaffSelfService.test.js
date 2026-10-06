import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StaffSelfService from './StaffSelfService';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockApi = { mySummary: jest.fn(), vacationCalc: jest.fn(), uploadDocument: jest.fn(), createRequest: jest.fn(), cancelRequest: jest.fn(), requestOvertime: jest.fn(), myNovelties: jest.fn() };
const mockReference = jest.fn();

jest.mock('../api', () => ({
  hrAPI: new Proxy({}, { get: (_, name) => (...args) => mockApi[name](...args) }),
  payrollAPI: { noveltyReference: (...args) => mockReference(...args) },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const box = (tag) => ({ children }) => React.createElement(tag, null, children);
  return {
    LoadingState: () => React.createElement('div', null, 'Cargando'),
    MotionPage: box('div'),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    SurfaceCard: box('section'),
  };
});

const SUMMARY = {
  vacation: { accrued: 15, taken: 5, available: 10 },
  kinds: { vacation: { label: 'Vacaciones', evidence: false }, sick_leave: { label: 'Incapacidad médica', evidence: true }, permission: { label: 'Permiso', evidence: false } },
  requests: [{ request_id: 'r1', kind_label: 'Vacaciones', start_date: '2026-11-02', end_date: '2026-11-06', days: 5, paid: true, status: 'pending' }, { request_id: 'r2', kind_label: 'Permiso', start_date: '2026-10-20', end_date: '2026-10-20', days: 1, paid: false, status: 'approved', decision_note: 'Listo' }],
  disclaimer: 'No sirve como soporte de nómina electrónica, facturas electrónicas ni para la UGPP.',
};

let container;
let root;

beforeEach(() => {
  mockApi.mySummary.mockResolvedValue({ data: SUMMARY });
  mockApi.vacationCalc.mockResolvedValue({ data: { end_date: '2026-10-07', return_date: '2026-10-08', days: 5 } });
  mockApi.uploadDocument.mockResolvedValue({ data: { document_id: 'doc1' } });
  mockApi.createRequest.mockResolvedValue({ data: {} });
  mockApi.cancelRequest.mockResolvedValue({ data: {} });
  mockApi.requestOvertime.mockResolvedValue({ data: {} });
  mockApi.myNovelties.mockResolvedValue({ data: { items: [{ novelty_id: 'n1', type: 'overtime', kind_label: 'Hora extra diurna', date: '2026-10-07', hours: 2, status: 'pending' }] } });
  mockReference.mockResolvedValue({ data: { max_overtime_per_day: 2, max_overtime_per_week: 12, kinds: { overtime_day: { label: 'Hora extra diurna', multiplier: 1.25 }, overtime_night: { label: 'Hora extra nocturna', multiplier: 1.75 } } } });
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
    root.render(<StaffSelfService />);
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

test('shows the vacation balance, the requests with their status and the legal disclaimer', async () => {
  await mount();
  expect(container.querySelector('[data-testid="vacation-available"]').textContent).toBe('10');
  const rows = container.querySelectorAll('[data-testid="request-row"]');
  expect(rows).toHaveLength(2);
  expect(rows[1].textContent).toContain('no remunerado');
  expect(rows[1].textContent).toContain('Listo');
  expect(container.textContent).toContain('ni para la UGPP');
});

test('the calculator fills the end date and the request is sent to the manager', async () => {
  await mount();
  await setValue(container.querySelector('[data-testid="request-start"]'), '2026-10-01');
  await click(container.querySelector('[data-testid="calc-button"]'));
  expect(mockApi.vacationCalc).toHaveBeenCalledWith({ start_date: '2026-10-01', days: 5 });
  expect(container.querySelector('[data-testid="calc-result"]').textContent).toContain('2026-10-08');
  expect(container.querySelector('[data-testid="request-end"]').value).toBe('2026-10-07');
  await click(container.querySelector('[data-testid="request-submit"]'));
  expect(mockApi.createRequest).toHaveBeenCalledWith({ kind: 'vacation', start_date: '2026-10-01', end_date: '2026-10-07', note: null, document_id: null, paid: null });
});

test('a medical leave cannot be sent without the photo and uploads it first', async () => {
  await mount();
  await setValue(container.querySelector('[data-testid="request-kind"]'), 'sick_leave');
  expect(container.querySelector('[data-testid="request-submit"]').disabled).toBe(true);
  const input = container.querySelector('[data-testid="request-file"]');
  const file = new File(['x'], 'inc.jpg', { type: 'image/jpeg' });
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.querySelector('[data-testid="request-submit"]').disabled).toBe(false);
  await click(container.querySelector('[data-testid="request-submit"]'));
  expect(mockApi.uploadDocument).toHaveBeenCalledWith(file);
  expect(mockApi.createRequest).toHaveBeenCalledWith(expect.objectContaining({ kind: 'sick_leave', document_id: 'doc1' }));
});

test('a pending request can be cancelled', async () => {
  await mount();
  await click(container.querySelector('[data-testid="cancel-request"]'));
  expect(mockApi.cancelRequest).toHaveBeenCalledWith('r1');
});

test('an employee can report overtime hours for approval and sees the status', async () => {
  await mount();
  expect(container.querySelector('[data-testid="overtime-row"]').textContent).toContain('Hora extra diurna · 2 h · Pendiente');
  await setValue(container.querySelector('[data-testid="overtime-kind"]'), 'overtime_night');
  await setValue(container.querySelector('[data-testid="overtime-hours"]'), '1.5');
  await click(container.querySelector('[data-testid="overtime-submit"]'));
  expect(mockApi.requestOvertime).toHaveBeenCalledWith(expect.objectContaining({ kind: 'overtime_night', hours: 1.5 }));
  expect(container.querySelector('[data-testid="overtime-card"]').textContent).toContain('2 h extra al día y 12 h a la semana');
});
