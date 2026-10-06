import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BookEntry from './BookEntry';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockOrg = jest.fn();

jest.mock('react-router-dom', () => ({ useParams: () => ({ orgId: 'org_1' }) }), { virtual: true });
jest.mock('../context/OrganizationContext', () => ({ useOrganization: () => ({ organization: mockOrg(), loadOrganization: jest.fn() }) }));
jest.mock('./BookingFlow', () => () => <div data-testid="booking-flow" />);
jest.mock('./PortalLanding', () => () => <div data-testid="portal-landing" />);

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.pushState({}, '', '/');
});

function mount(organization, search = '') {
  mockOrg.mockReturnValue(organization);
  window.history.pushState({}, '', `/book/org_1${search}`);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<BookEntry />));
  return (id) => container.querySelector(`[data-testid="${id}"]`);
}

test('group-class templates open on the landing page', () => {
  const find = mount({ organization_id: 'org_1', client_portal_theme: 'estudio' });
  expect(find('portal-landing')).not.toBeNull();
  expect(find('booking-flow')).toBeNull();
});

test('Reservar (?reservar=1) goes straight to the booking flow', () => {
  const find = mount({ organization_id: 'org_1', client_portal_theme: 'estudio' }, '?reservar=1&servicio=s1');
  expect(find('booking-flow')).not.toBeNull();
});

test('templates without a landing, and managers who turned it off, keep going straight to booking', () => {
  expect(mount({ organization_id: 'org_1', client_portal_theme: 'classic' })('booking-flow')).not.toBeNull();
  act(() => root.unmount()); container.remove();
  expect(mount({ organization_id: 'org_1', client_portal_theme: 'estudio', portal_landing_enabled: false })('booking-flow')).not.toBeNull();
});

test('waits for this organization instead of flashing the booking flow', () => {
  const find = mount({ organization_id: 'other_org', client_portal_theme: 'estudio' });
  expect(find('booking-flow')).toBeNull();
  expect(find('portal-landing')).toBeNull();
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
});
