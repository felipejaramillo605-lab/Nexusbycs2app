import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { EN } from './portalI18n.en';
import { resolveLanguage, setPortalLanguage, translate, usePortalT } from './portalI18n';
import PortalLanguageSwitch from '../components/PortalLanguageSwitch';

global.IS_REACT_ACT_ENVIRONMENT = true;

let mockOrg = null;
jest.mock('../context/OrganizationContext', () => ({ useOptionalOrganization: () => ({ organization: mockOrg }) }));

afterEach(() => {
  setPortalLanguage(null);
  mockOrg = null;
});

test('a Spanish text without translation is returned unchanged, never breaking a screen', () => {
  expect(translate('Texto que no existe en el diccionario', 'en')).toBe('Texto que no existe en el diccionario');
  expect(translate('Reservar', 'es')).toBe('Reservar');
  expect(translate('Reservar', 'en')).toBe('Book');
});

test('positional markers are filled in both languages', () => {
  expect(translate('Hola, {0}', 'es', ['Ana'])).toBe('Hola, Ana');
  expect(translate('{0} agregado al carrito', 'en', ['Shampoo'])).toBe('Shampoo added to cart');
  expect(translate('{0} · sesión {1}', 'en', ['10:00', 2])).toBe('10:00 · session 2');
});

test('US organizations default to English, Colombian ones to Spanish, and the visitor choice always wins', () => {
  expect(resolveLanguage({ operating_country: 'US' }, null)).toBe('en');
  expect(resolveLanguage({ operating_country: 'CO' }, null)).toBe('es');
  expect(resolveLanguage({}, null)).toBe('es');
  expect(resolveLanguage({ operating_country: 'US' }, 'es')).toBe('es');
  expect(resolveLanguage({ operating_country: 'CO' }, 'en')).toBe('en');
});

test('every placeholder in the source text appears in its English translation', () => {
  const marks = (text) => (text.match(/\{\d+\}/g) || []).sort().join(',');
  Object.entries(EN).forEach(([spanish, english]) => expect(marks(english)).toBe(marks(spanish)));
});

test('every t(...) text used in the portal has an English translation', () => {
  const src = path.join(__dirname, '..');
  const files = [
    'pages/BookingFlow.js', 'pages/PortalLanding.jsx', 'components/ClientPortalNav.js', 'pages/ClientPortalAuth.js',
    'pages/ClientPortalDashboard.js', 'pages/CancelAppointment.js', 'pages/RescheduleAppointment.js', 'pages/ForgotPin.js',
    'pages/ResetPin.js', 'components/ReviewModal.js', 'pages/ClientCatalog.js', 'pages/ClientCart.js',
    'pages/ClientCatalogCheckout.js', 'pages/CustomerPortal.js', 'hooks/useBookingFlow.js', 'hooks/useClientPortalAuth.js',
    'hooks/useClientDashboard.js', 'components/PortalLanguageSwitch.jsx', 'lib/bookingWindow.js',
  ];
  const missing = [];
  files.forEach((file) => {
    const code = fs.readFileSync(path.join(src, file), 'utf8');
    for (const match of code.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
      const key = match[1].replace(/\\'/g, "'");
      if (!(key in EN)) missing.push(`${file}: ${key}`);
    }
  });
  expect(missing).toEqual([]);
});

function Probe() {
  const { t, lang } = usePortalT();
  return <p data-testid="probe" data-lang={lang}>{t('Reservar')}</p>;
}

test('the switch changes the language of every component that uses the hook and remembers the choice', () => {
  mockOrg = { operating_country: 'CO' };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<><PortalLanguageSwitch /><Probe /></>));
  const probe = () => container.querySelector('[data-testid="probe"]');
  expect(probe().textContent).toBe('Reservar');
  const button = (code) => container.querySelector(`button[lang="${code}"]`);
  expect(button('es').getAttribute('aria-pressed')).toBe('true');
  act(() => button('en').click());
  expect(probe().textContent).toBe('Book');
  expect(button('en').getAttribute('aria-pressed')).toBe('true');
  expect(window.localStorage.getItem('nexus_portal_language')).toBe('en');
  act(() => button('es').click());
  expect(probe().textContent).toBe('Reservar');
  act(() => root.unmount());
  container.remove();
});

test('a US organization opens in English without the visitor choosing', () => {
  mockOrg = { operating_country: 'US' };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  expect(container.querySelector('[data-testid="probe"]').textContent).toBe('Book');
  expect(container.querySelector('[data-testid="probe"]').getAttribute('data-lang')).toBe('en');
  act(() => root.unmount());
  container.remove();
});
