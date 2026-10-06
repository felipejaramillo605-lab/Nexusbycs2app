import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PortalWhatsAppButton from './PortalWhatsAppButton';

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(organization) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<PortalWhatsAppButton organization={organization} />));
  return container.querySelector('[data-testid="portal-whatsapp-button"]');
}

test('does not render unless the manager turned the button on', () => {
  expect(mount({ name: 'Moena', whatsapp_link: 'https://wa.me/573115587587' })).toBeNull();
  expect(mount({ name: 'Moena', portal_whatsapp_button: false, whatsapp_link: 'https://wa.me/573115587587' })).toBeNull();
});

test('opens the WhatsApp configured by the manager in a new tab', () => {
  const link = mount({ name: 'Moena', portal_whatsapp_button: true, whatsapp_link: 'https://wa.me/573115587587' });
  expect(link.getAttribute('href')).toContain('https://wa.me/573115587587');
  expect(link.getAttribute('href')).toContain('text=');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toContain('noopener');
  expect(link.getAttribute('aria-label')).toBe('Escribir por WhatsApp');
});

test('falls back to the business phone and ignores links that are not WhatsApp', () => {
  expect(mount({ name: 'Moena', portal_whatsapp_button: true, phone: '+57 311 558 7587' }).getAttribute('href')).toContain('wa.me/573115587587');
  expect(mount({ name: 'Moena', portal_whatsapp_button: true, whatsapp_link: 'javascript:alert(1)' })).toBeNull();
});
