import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FeatureGate from './FeatureGate';
import CountryOfOperationField, { fiscalLabels } from './CountryOfOperationField';
import { filterSectionsByCountry, adminSections } from './design/adminNavigation';
import { FEATURES } from '../lib/countryProfile';

global.IS_REACT_ACT_ENVIRONMENT = true;

let mockOrg = null;
const mockLoad = jest.fn();

jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org_1' } }) }));
jest.mock('../context/OrganizationContext', () => ({ useOrganization: () => ({ organization: mockOrg, loadOrganization: mockLoad }) }));
jest.mock('./design/AdminShell', () => ({ AdminShell: ({ children }) => <div data-testid="admin-shell">{children}</div> }));
jest.mock('./design/StaffNav', () => ({ StaffNav: () => <nav data-testid="staff-nav" /> }));

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

function mount(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(element));
}

test('Colombia (and organizations created before the country existed) see the page as always', () => {
  mockOrg = { organization_id: 'org_1' };
  mount(<FeatureGate feature={FEATURES.PAYROLL}><div data-testid="payroll-page" /></FeatureGate>);
  expect(container.querySelector('[data-testid="payroll-page"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="feature-unavailable"]')).toBeNull();
});

test('a US organization gets a "coming soon" notice instead of payroll, HR and marketing, and keeps appointments working', () => {
  mockOrg = { organization_id: 'org_1', operating_country: 'US' };
  [FEATURES.PAYROLL, FEATURES.HR, FEATURES.MARKETING].forEach((feature) => {
    mount(<FeatureGate feature={feature}><div data-testid="page" /></FeatureGate>);
    expect(container.querySelector('[data-testid="page"]')).toBeNull();
    const notice = container.querySelector('[data-testid="feature-unavailable"]');
    expect(notice.textContent).toContain('disponible pronto');
    expect(notice.textContent).toContain('Estados Unidos');
    expect(notice.textContent).toContain('recordatorios');
    act(() => root.unmount());
    container.remove();
  });
  mount(<div />);
});

test('while the organization is still loading the page is shown (the API enforces the rule anyway)', () => {
  mockOrg = null;
  mount(<FeatureGate feature={FEATURES.HR}><div data-testid="page" /></FeatureGate>);
  expect(container.querySelector('[data-testid="page"]')).not.toBeNull();
  expect(mockLoad).toHaveBeenCalledWith('org_1');
});

test('staff pages show the notice with the staff navigation', () => {
  mockOrg = { organization_id: 'org_1', operating_country: 'US' };
  mount(<FeatureGate feature={FEATURES.HR} shell="staff"><div data-testid="page" /></FeatureGate>);
  expect(container.querySelector('[data-testid="staff-nav"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="feature-unavailable"]')).not.toBeNull();
});

test('the manager menu hides payroll, HR, wellbeing and marketing only for US organizations', () => {
  const paths = (sections) => sections.flatMap((section) => section.items.map(([path]) => path));
  const co = paths(filterSectionsByCountry(adminSections, { operating_country: 'CO' }));
  const us = paths(filterSectionsByCountry(adminSections, { operating_country: 'US' }));
  ['/manager/payroll', '/manager/hr', '/manager/wellbeing', '/manager/marketing'].forEach((path) => {
    expect(co).toContain(path);
    expect(us).not.toContain(path);
  });
  expect(us).toEqual(expect.arrayContaining(['/manager/appointments', '/manager/clients', '/manager/services', '/manager/inventory']));
});

test('the onboarding question lets the owner pick the country and warns about what is hidden', () => {
  const onChange = jest.fn();
  mount(<CountryOfOperationField value="CO" onChange={onChange} />);
  expect(container.querySelector('[data-testid="country-disabled-notice"]')).toBeNull();
  const usRadio = container.querySelector('input[value="US"]');
  act(() => usRadio.click());
  expect(onChange).toHaveBeenCalledWith('US');
  act(() => root.unmount());
  container.remove();
  mount(<CountryOfOperationField value="US" onChange={onChange} />);
  const notice = container.querySelector('[data-testid="country-disabled-notice"]').textContent;
  expect(notice).toContain('Nómina');
  expect(notice).toContain('Campañas de marketing');
  expect(notice).toContain('recordatorios');
});

test('fiscal labels follow the country: NIT and department vs EIN and state', () => {
  expect(fiscalLabels('CO').documentOptions.map(([value]) => value)).toContain('NIT');
  expect(fiscalLabels('CO').region).toBe('Departamento');
  expect(fiscalLabels('US').documentOptions.map(([value]) => value)).toEqual(['EIN', 'OTHER']);
  expect(fiscalLabels('US').region).toBe('Estado');
  expect(fiscalLabels('US').country).toBe('United States');
  expect(fiscalLabels('US').phoneExample.startsWith('+1')).toBe(true);
});
