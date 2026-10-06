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
