import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PortalLanding from './PortalLanding';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockOrg = jest.fn();
const mockServices = jest.fn();
const mockPlans = jest.fn();

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ orgId: 'org_1' }),
}), { virtual: true });
jest.mock('../context/OrganizationContext', () => ({
  useOrganization: () => ({ organization: mockOrg() }),
  useOptionalOrganization: () => ({ organization: mockOrg() }),
}));
jest.mock('../api', () => ({
  publicAPI: { getServices: (...args) => mockServices(...args), getMembershipPlans: (...args) => mockPlans(...args) },
}));

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount({ organization, services = [], plans = [] }) {
  mockOrg.mockReturnValue(organization);
  mockServices.mockResolvedValue({ data: services });
  mockPlans.mockResolvedValue({ data: plans });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<PortalLanding />); });
}

const org = { organization_id: 'org_1', name: 'Moena Studios', portal_welcome_message: 'Hot Pilates & Hot Barre', address: 'Calle 11A # 31A-89', city: 'Medellín', phone: '3115587587' };
const hotBarre = { service_id: 's1', name: 'Hot Barre', service_type: 'group', short_description: 'Barre y fuerza bajo calor', cover_image_url: '/img/barre.webp' };
const individual = { service_id: 's9', name: 'Masaje', service_type: 'individual' };

test('shows the cover, the experiences (group classes only) and the manager-chosen section name', async () => {
  await mount({ organization: { ...org, portal_experiences_label: 'Disciplinas' }, services: [hotBarre, individual] });
  expect(container.querySelector('h1').textContent).toBe('Moena Studios');
  expect(container.textContent).toContain('Disciplinas');
  const cards = container.querySelectorAll('[data-testid="landing-experience"]');
  expect(cards).toHaveLength(1);
  expect(cards[0].getAttribute('href')).toBe('/book/org_1?reservar=1&servicio=s1');
  expect(cards[0].textContent).toContain('Barre y fuerza bajo calor');
  expect(cards[0].querySelector('img').getAttribute('src')).toBe('/img/barre.webp');
});

test('the header has the logo, the section links, login and reserve', async () => {
  await mount({ organization: { ...org, logo_url: '/logo.png' }, services: [hotBarre], plans: [{ plan_id: 'p1', name: 'Vital', price: 240000, billing_cycle_days: 30, classes_per_cycle: 4, services: [{ service_id: 's1', name: 'Hot Barre' }] }] });
  const nav = container.querySelector('.nexus-landing-nav');
  expect(nav.querySelector('.nexus-landing-brand img').getAttribute('src')).toBe('/logo.png');
  expect(Array.from(nav.querySelectorAll('nav a')).map((a) => a.textContent)).toEqual(['Experiencias', 'Planes', 'Contacto']);
  expect(nav.querySelector('.nexus-landing-login').getAttribute('href')).toBe('/portal/org_1/auth');
  expect(nav.querySelector('.nexus-landing-reserve').getAttribute('href')).toBe('/book/org_1?reservar=1');
});

test('plans show classes, price per class and validity, and respect the price and plans settings', async () => {
  const plan = { plan_id: 'p1', name: 'Energía', price: 440000, billing_cycle_days: 30, classes_per_cycle: 8, unlimited: false, services: [{ service_id: 's1', name: 'Hot Barre' }] };
  await mount({ organization: org, services: [hotBarre], plans: [plan] });
  const card = container.querySelector('[data-testid="landing-plan"]');
  expect(card.textContent).toContain('8 clases');
  expect(card.textContent).toMatch(/\$\s*55\.000 por clase/);
  expect(card.textContent).toContain('Vigencia: 1 mes');
  act(() => root.unmount()); container.remove();
  await mount({ organization: { ...org, portal_show_prices: false }, services: [hotBarre], plans: [plan] });
  expect(container.querySelector('[data-testid="landing-plan"]').textContent).not.toContain('$');
  act(() => root.unmount()); container.remove();
  await mount({ organization: { ...org, portal_show_plans: false }, services: [hotBarre], plans: [plan] });
  expect(container.querySelector('#planes')).toBeNull();
});

test('"Quiero este plan" opens WhatsApp with a message naming the plan, classes, price and validity', async () => {
  const plan = { plan_id: 'p1', name: 'Energía', price: 440000, billing_cycle_days: 30, classes_per_cycle: 8, unlimited: false, services: [{ service_id: 's1', name: 'Hot Barre' }] };
  await mount({ organization: { ...org, whatsapp_link: 'https://wa.me/573115587587' }, services: [hotBarre], plans: [plan] });
  const link = container.querySelector('[data-testid="landing-plan"] a.nexus-landing-reserve');
  const url = new URL(link.getAttribute('href'));
  expect(url.origin + url.pathname).toBe('https://wa.me/573115587587');
  const text = url.searchParams.get('text');
  expect(text).toContain('Moena Studios');
  expect(text).toContain('plan Energía');
  expect(text).toContain('8 clases');
  expect(text).toMatch(/\$\s*440\.000/);
  expect(text).toContain('vigencia 1 mes');
  expect(link.getAttribute('target')).toBe('_blank');
  act(() => root.unmount()); container.remove();
  await mount({ organization: { ...org, whatsapp_link: 'https://wa.me/573115587587', portal_show_prices: false }, services: [hotBarre], plans: [plan] });
  const hidden = new URL(container.querySelector('[data-testid="landing-plan"] a.nexus-landing-reserve').getAttribute('href')).searchParams.get('text');
  expect(hidden).not.toContain('$');
});

test('uses the uploaded image as the cover and the predeterminate art when there is none', async () => {
  await mount({ organization: { ...org, portal_background_type: 'image', portal_background_url: '/hero.webp' } });
  expect(container.querySelector('.nexus-landing').getAttribute('data-hero')).toBe('media');
  expect(container.querySelector('.nexus-landing-hero-media img').getAttribute('src')).toBe('/hero.webp');
  act(() => root.unmount()); container.remove();
  await mount({ organization: org });
  expect(container.querySelector('.nexus-landing').getAttribute('data-hero')).toBe('art');
  expect(container.querySelector('.nexus-landing-hero-art')).not.toBeNull();
});

test('contact lists the business data and a safe WhatsApp link', async () => {
  await mount({ organization: { ...org, whatsapp_link: 'https://wa.me/573115587587', business_hours: 'Lun-Sáb 6am-8pm' } });
  const contact = container.querySelector('#contacto');
  expect(contact.textContent).toContain('Calle 11A # 31A-89, Medellín');
  expect(contact.textContent).toContain('Lun-Sáb 6am-8pm');
  const links = Array.from(contact.querySelectorAll('a')).map((a) => a.getAttribute('href'));
  expect(links.some((href) => href.startsWith('https://wa.me/573115587587'))).toBe(true);
  expect(links.some((href) => href.startsWith('https://www.google.com/maps/search/'))).toBe(true);
  expect(links).toContain('tel:3115587587');
});

test('a US organization opens the landing in English, with the switch to go back to Spanish', async () => {
  const plan = { plan_id: 'p1', name: 'Energy', price: 440, billing_cycle_days: 30, classes_per_cycle: 8, unlimited: false, services: [{ service_id: 's1', name: 'Hot Barre' }] };
  await mount({ organization: { ...org, operating_country: 'US', whatsapp_link: 'https://wa.me/13055551234' }, services: [hotBarre], plans: [plan] });
  const nav = container.querySelector('.nexus-landing-nav');
  expect(Array.from(nav.querySelectorAll('nav a')).map((a) => a.textContent)).toEqual(['Experiences', 'Plans', 'Contact']);
  expect(nav.querySelector('.nexus-landing-login').textContent).toBe('Sign in');
  expect(container.querySelector('.nexus-landing-hero .nexus-landing-reserve').textContent).toBe('Book a class');
  const card = container.querySelector('[data-testid="landing-plan"]');
  expect(card.textContent).toContain('8 classes');
  expect(card.textContent).toContain('Valid for: 1 month');
  const text = new URL(card.querySelector('a.nexus-landing-reserve').getAttribute('href')).searchParams.get('text');
  expect(text).toContain('I would like the Energy plan');
  expect(text).toContain('valid for 1 month');
  expect(container.querySelector('[data-testid="portal-language-switch"]')).not.toBeNull();
});
