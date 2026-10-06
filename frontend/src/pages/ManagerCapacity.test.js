import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerCapacity from './ManagerCapacity';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockWeekly = jest.fn();
jest.mock('../api', () => ({ capacityAPI: { weekly: (...a) => mockWeekly(...a) } }));
jest.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org_a' } }) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
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

const WEEK = (start, end) => ({
  week_start: start,
  week_end: end,
  totals: { occupancy: 0.5, free_hours: 20, appointments: 6, cancellations: 1, available_hours: 40, booked_hours: 20 },
  insights: ['El martes 2026-10-06 tiene solo 10% de ocupación (7 h libres): buen día para promocionar.'],
  days: [{ date: start, weekday: 'lunes', available_hours: 8, booked_hours: 4, occupancy: 0.5 }],
  professionals: [{ barber_id: 'b1', name: 'Fausto', available_hours: 40, booked_hours: 20, free_hours: 20, occupancy: 0.5, cancellations: 1 }],
  classes: { sessions: 1, seats: 10, booked: 10, occupancy: 1, waitlist: 2, items: [{ class_session_id: 'c1', date: start, time: '18:00', booked: 10, capacity: 10, waitlist: 2 }] },
});

let container;
let root;

beforeEach(() => {
  mockWeekly.mockImplementation((params) =>
    Promise.resolve({ data: params.week_start === '2026-10-12' ? WEEK('2026-10-12', '2026-10-18') : WEEK('2026-10-05', '2026-10-11') }),
  );
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
    root.render(<ManagerCapacity />);
  });
  await act(async () => {});
}

test('shows the week, the advice, the professionals and the classes with waitlist', async () => {
  await mount();
  expect(mockWeekly).toHaveBeenCalledWith({ organization_id: 'org_a' });
  expect(container.querySelector('[data-testid="capacity-week"]').textContent).toContain('2026-10-05 al 2026-10-11');
  expect(container.querySelector('[data-testid="capacity-insights"]').textContent).toContain('buen día para promocionar');
  expect(container.querySelector('[data-testid="capacity-professionals"]').textContent).toContain('Fausto');
  expect(container.querySelector('[data-testid="capacity-classes"]').textContent).toContain('2 en lista de espera');
});

test('the next-week button asks for the following Monday', async () => {
  await mount();
  await act(async () => {
    container.querySelector('[aria-label="Semana siguiente"]').click();
  });
  expect(mockWeekly).toHaveBeenLastCalledWith({ organization_id: 'org_a', week_start: '2026-10-12' });
  expect(container.querySelector('[data-testid="capacity-week"]').textContent).toContain('2026-10-12 al 2026-10-18');
});
