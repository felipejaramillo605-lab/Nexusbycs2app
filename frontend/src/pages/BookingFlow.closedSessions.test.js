import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BookingFlow from './BookingFlow';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockFlow = jest.fn();

jest.mock('../hooks/useBookingFlow', () => ({ useBookingFlow: () => mockFlow() }));
jest.mock('react-router-dom', () => ({ Link: ({ children }) => <a>{children}</a> }), { virtual: true });
jest.mock('framer-motion', () => {
  const React = jest.requireActual('react');
  const passthrough = (tag) => ({ children, initial, animate, exit, transition, ...props }) => React.createElement(tag, props, children);
  return { AnimatePresence: ({ children }) => children, motion: { section: passthrough('section'), div: passthrough('div') } };
});
jest.mock('react-phone-number-input', () => () => null);
jest.mock('react-phone-number-input/style.css', () => ({}), { virtual: true });
jest.mock('../components/ClientPortalNav', () => () => null);
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return { ActionButton: ({ children, icon: _i, loading: _l, ...props }) => React.createElement('button', { type: 'button', ...props }, children) };
});

const base = {
  orgId: 'org_1', organization: { name: 'Org' }, cart: { items: [], count: 0, total: 0 }, step: 3, services: [],
  selectedService: { name: 'Pilates', price: 25000, duration: 60 }, selectService: jest.fn(), selectedBarber: { name: 'Fausto' },
  selectBarber: jest.fn(), selectedDate: '2026-10-08', selectedTime: '', slots: [], classSessions: [], selectedClassSession: null,
  loadingSlots: false, submitting: false, success: null, remember: false, setRememberClientData: jest.fn(), marketingConsent: false,
  setMarketingConsentChoice: jest.fn(), error: '', client: { name: '', phone: '', email: '' }, updateClientField: jest.fn(), eligible: [],
  isGroupService: true, groupSessionById: jest.fn(), next: jest.fn(), submit: jest.fn(), minDate: '2026-10-05', days: [],
  steps: ['Servicio', 'Profesional', 'Fecha', 'Datos'], selectDate: jest.fn(), selectSlot: jest.fn(), goToStep: jest.fn(), goBack: jest.fn(),
  closedSessions: [],
};

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(overrides) {
  mockFlow.mockReturnValue({ ...base, ...overrides });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<BookingFlow />);
  });
}

test('a class whose bookings are not open yet is shown disabled with the date it opens, not as selectable', async () => {
  const closed = { class_session_id: 'c1', time: '10:00', open_for_booking: false, booking_opens_on: '2026-10-06' };
  await mount({ classSessions: [closed], closedSessions: [closed] });
  const chip = container.querySelector('[data-testid="booking-closed-session"]');
  expect(chip).not.toBeNull();
  expect(chip.disabled).toBe(true);
  expect(chip.textContent).toContain('abre el 06/10');
  expect(container.textContent).not.toContain('No hay sesiones con cupos disponibles');
});

test('open sessions stay selectable next to the closed ones', async () => {
  const open = { class_session_id: 'o1', time: '09:00', open_for_booking: true };
  const closed = { class_session_id: 'c1', time: '10:00', open_for_booking: false, booking_opens_on: '2026-10-06' };
  await mount({ classSessions: [open, closed], closedSessions: [closed], slots: ['o1'], groupSessionById: () => open });
  const buttons = Array.from(container.querySelectorAll('.nexus-slots button'));
  expect(buttons).toHaveLength(2);
  expect(buttons.filter((b) => b.disabled)).toHaveLength(1);
});

test('a group class with a booking window explains it: farther sessions must wait until that time is left', async () => {
  const closed = { class_session_id: 'c1', time: '10:00', open_for_booking: false, booking_opens_on: '2026-10-06', booking_window_days: 1 };
  await mount({ classSessions: [closed], closedSessions: [closed], selectedService: { name: 'Pilates', price: 25000, duration: 60, booking_window_days: 1 } });
  const notice = container.querySelector('[data-testid="booking-window-notice"]');
  expect(notice.textContent).toContain('24 horas de anticipación');
  expect(notice.textContent).toContain('vuelve cuando falte ese tiempo');
});

test('no notice when the class has no booking window', async () => {
  await mount({ classSessions: [{ class_session_id: 'o1', time: '09:00', open_for_booking: true }], slots: ['o1'], groupSessionById: () => ({ time: '09:00' }) });
  expect(container.querySelector('[data-testid="booking-window-notice"]')).toBeNull();
});

test('directions link only appears when the org enabled the map and has an address', async () => {
  await mount({ organization: { name: 'Org', address: 'Calle 10 # 5-20', city: 'Cali', portal_show_map: true } });
  const link = container.querySelector('[data-testid="portal-directions-link"]');
  expect(link.getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=Calle%2010%20%23%205-20%2C%20Cali');
  expect(link.getAttribute('rel')).toContain('noopener');
});

test('no directions link when the map is off', async () => {
  await mount({ organization: { name: 'Org', address: 'Calle 10 # 5-20', portal_show_map: false } });
  expect(container.querySelector('[data-testid="portal-directions-link"]')).toBeNull();
});

const PRICED = { services: [{ service_id: 's1', name: 'Corte', price: 25000, duration: 30 }], step: 1 };

test('prices, team details and hours follow the portal switches', async () => {
  await mount({ ...PRICED, organization: { name: 'Org', business_hours: 'Lun-Vie 9-6', portal_show_prices: false, portal_show_hours: false } });
  expect(container.textContent).not.toContain('25.000');
  expect(container.querySelector('[data-testid="portal-hours"]')).toBeNull();
});

test('everything stays visible when the switches were never turned off', async () => {
  await mount({ ...PRICED, organization: { name: 'Org', business_hours: 'Lun-Vie 9-6' } });
  expect(container.textContent).toContain('25.000');
  expect(container.querySelector('[data-testid="portal-hours"]').textContent).toContain('Lun-Vie 9-6');
});

test('with the team switch off professionals show only their name', async () => {
  const pro = { barber_id: 'b1', name: 'Fausto', avatar: 'https://x/y.png', start_time: '09:00', end_time: '18:00', available_days: [1] };
  await mount({ step: 2, eligible: [pro], days: ['Dom', 'Lun'], organization: { name: 'Org', portal_show_team: false } });
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('Fausto');
  expect(container.textContent).not.toContain('09:00');
});

test('a service with deposit and no-show rules asks for explicit acceptance on the data step', async () => {
  const service = { name: 'Corte', price: 50000, duration: 30, deposit_percent: 30, no_show_policy: 'Se pierde el depósito', cancellation_cutoff_hours: 24 };
  const setPolicyAcceptedChoice = jest.fn();
  await mount({ step: 4, selectedService: service, isGroupService: false, setPolicyAcceptedChoice, policyAccepted: false });
  const box = container.querySelector('[data-testid="booking-policy"]');
  expect(box.textContent).toContain('Depósito: 30% del valor');
  expect(box.textContent).toContain('15.000');
  expect(box.textContent).toContain('Cancelación sin costo hasta 24 horas antes');
  expect(box.textContent).toContain('Se pierde el depósito');
  await act(async () => {
    container.querySelector('[data-testid="booking-policy-checkbox"]').click();
  });
  expect(setPolicyAcceptedChoice).toHaveBeenCalledWith(true);
});

test('services without rules show no conditions box', async () => {
  await mount({ step: 4, selectedService: { name: 'Corte', price: 50000, duration: 30 }, isGroupService: false });
  expect(container.querySelector('[data-testid="booking-policy"]')).toBeNull();
});
