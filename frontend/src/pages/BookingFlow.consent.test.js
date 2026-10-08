import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BookingFlow from './BookingFlow';
import { MESSAGING_CONSENT_TEXT } from '../lib/countryProfile';
import { EN } from '../lib/portalI18n.en';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockFlow = jest.fn();

jest.mock('../hooks/useBookingFlow', () => ({ useBookingFlow: () => mockFlow() }));
jest.mock('../context/OrganizationContext', () => ({
  useOptionalOrganization: () => ({ organization: mockFlow().organization }),
}));
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
  orgId: 'org_1', cart: { items: [], count: 0, total: 0 }, step: 4, services: [],
  selectedService: { name: 'Pilates', price: 25, duration: 60 }, selectService: jest.fn(), selectedBarber: { name: 'Fausto' },
  selectBarber: jest.fn(), selectedDate: '2026-10-08', selectedTime: '10:00', slots: [], classSessions: [], selectedClassSession: null,
  loadingSlots: false, submitting: false, success: null, remember: false, setRememberClientData: jest.fn(), marketingConsent: false,
  setMarketingConsentChoice: jest.fn(), messagingConsent: false, setMessagingConsentChoice: jest.fn(), messagingRequired: false,
  error: '', client: { name: '', phone: '', email: '' }, updateClientField: jest.fn(), eligible: [], isGroupService: false,
  groupSessionById: jest.fn(), next: jest.fn(), submit: jest.fn(), minDate: '2026-10-05', days: [],
  steps: ['Servicio', 'Profesional', 'Fecha y hora', 'Tus datos'], selectDate: jest.fn(), selectSlot: jest.fn(),
  goToStep: jest.fn(), goBack: jest.fn(), closedSessions: [],
};

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function mount(overrides) {
  mockFlow.mockReturnValue({ ...base, ...overrides });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<BookingFlow />); });
}

const q = (id) => container.querySelector(`[data-testid="${id}"]`);

test('a US organization asks for the text-message consent and no longer offers promotions', async () => {
  await mount({ organization: { name: 'Studio', operating_country: 'US' }, messagingRequired: true });
  expect(q('booking-messaging-checkbox')).not.toBeNull();
  expect(q('booking-marketing-checkbox')).toBeNull();
  // el texto mostrado es el del consentimiento (en ingles, idioma por defecto de EE. UU.)
  expect(container.textContent).toContain(EN[MESSAGING_CONSENT_TEXT]);
  expect(container.textContent).toContain('Reply STOP to opt out');
  act(() => q('booking-messaging-checkbox').click());
  expect(base.setMessagingConsentChoice).toHaveBeenCalledWith(true);
});

test('Colombia keeps the promotions checkbox and shows no text-message consent', async () => {
  await mount({ organization: { name: 'Studio', operating_country: 'CO' }, messagingRequired: false });
  expect(q('booking-messaging-checkbox')).toBeNull();
  expect(q('booking-marketing-checkbox')).not.toBeNull();
});

test('the consent text has an English translation', () => {
  expect(EN[MESSAGING_CONSENT_TEXT]).toBeTruthy();
});
