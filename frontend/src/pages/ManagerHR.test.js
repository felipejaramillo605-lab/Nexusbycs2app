import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerHR from './ManagerHR';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockApi = { overview: jest.fn(), calendar: jest.fn(), decide: jest.fn(), downloadDocument: jest.fn() };
const mockSave = jest.fn();

jest.mock('../api', () => ({ hrAPI: new Proxy({}, { get: (_, name) => (...args) => mockApi[name](...args) }) }));
jest.mock('../lib/download', () => ({ saveBlob: (...a) => mockSave(...a) }));
jest.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org_a' } }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const box = (tag) => ({ children, label, value }) => React.createElement(tag, null, label, value, children);
  return {
    EmptyState: ({ title }) => React.createElement('div', null, title),
    LoadingState: () => React.createElement('div', null, 'Cargando'),
    MetricCard: box('div'),
    MotionPage: box('div'),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    SurfaceCard: box('section'),
  };
});

const TODAY = new Date().toISOString().slice(0, 10);
const PENDING = { request_id: 'r1', employee_name: 'Ana', kind_label: 'Vacaciones', start_date: TODAY, end_date: TODAY, days: 1, paid: true, status: 'pending', document_id: 'd1' };

let container;
let root;
const SCOPE = { organization_id: 'org_a' };

beforeEach(() => {
  mockApi.overview.mockResolvedValue({ data: { pending_count: 1, pending: [PENDING], out_today: ['Luis'], birthdays: [{ name: 'Ana', days_until: 3 }], anniversaries: [{ name: 'Luis', days_until: 0, years: 2 }], disclaimer: 'No sirve como soporte de nómina electrónica, facturas electrónicas ni para la UGPP.' } });
  mockApi.calendar.mockResolvedValue({ data: { items: [{ ...PENDING, request_id: 'r2', employee_name: 'Luis', kind_label: 'Incapacidad médica', status: 'approved' }], overlap_by_day: { [TODAY]: 1 }, out_today: ['Luis'], holidays: [] } });
  mockApi.decide.mockResolvedValue({ data: {} });
  mockApi.downloadDocument.mockResolvedValue({ data: new Blob(['x']), headers: {} });
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
    root.render(<ManagerHR />);
  });
  await act(async () => {});
}
const click = async (el) => {
  await act(async () => {
    el.click();
  });
};

test('shows pending requests with an overlap warning, who is out, birthdays and anniversaries', async () => {
  await mount();
  const row = container.querySelector('[data-testid="pending-row"]');
  expect(row.textContent).toContain('Ana');
  expect(row.textContent).toContain('ya hay 1 persona(s) ausente(s)');
  expect(container.querySelector('[data-testid="team-calendar"]').textContent).toContain('Fuera hoy: Luis');
  expect(container.querySelector('[data-testid="calendar-row"]').textContent).toContain('Luis (Incapacidad médica)');
  const celebrations = container.querySelector('[data-testid="celebrations"]').textContent;
  expect(celebrations).toContain('Ana — en 3 días');
  expect(celebrations).toContain('Luis — 2 años hoy');
  expect(container.textContent).toContain('ni para la UGPP');
});

test('approves and rejects in one click and opens the supporting document', async () => {
  await mount();
  await click(container.querySelector('[data-testid="approve-request"]'));
  expect(mockApi.decide).toHaveBeenCalledWith('r1', { approve: true, note: null, allow_over_balance: false }, SCOPE);
  await click(container.querySelector('[data-testid="reject-request"]'));
  expect(mockApi.decide).toHaveBeenLastCalledWith('r1', { approve: false, note: null, allow_over_balance: false }, SCOPE);
  await click(container.querySelector('[data-testid="open-document"]'));
  expect(mockApi.downloadDocument).toHaveBeenCalledWith('d1', SCOPE);
  expect(mockSave).toHaveBeenCalled();
});

test('asks for confirmation before approving a vacation above the available balance', async () => {
  window.confirm = jest.fn(() => true);
  mockApi.decide.mockRejectedValueOnce({ response: { data: { detail: { code: 'VACATION_OVER_BALANCE', message: 'Solicita 5 días y tiene 1 disponibles.' } } } });
  await mount();
  await click(container.querySelector('[data-testid="approve-request"]'));
  expect(window.confirm).toHaveBeenCalledWith('Solicita 5 días y tiene 1 disponibles.');
  expect(mockApi.decide).toHaveBeenLastCalledWith('r1', { approve: true, note: null, allow_over_balance: true }, SCOPE);
});
