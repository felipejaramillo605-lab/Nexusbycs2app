import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BusinessProfile from './BusinessProfile';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetOrganization = jest.fn();
const mockUpdateOrganization = jest.fn();

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org-1' } }) }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../api', () => ({ organizationAPI: { get: (...args) => mockGetOrganization(...args), update: (...args) => mockUpdateOrganization(...args) } }));

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<BusinessProfile />);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return { host, root };
}

describe('BusinessProfile', () => {
  let root;
  afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; root = null; jest.clearAllMocks(); });

  test('shows a visible error and disables save when the initial load fails', async () => {
    mockGetOrganization.mockRejectedValue(new Error('network'));
    const rendered = await renderPage(); root = rendered.root;
    expect(rendered.host.querySelector('[role="alert"]')).toBeTruthy();
    expect(rendered.host.textContent).toContain('No pudimos cargar el perfil');
    expect([...rendered.host.querySelectorAll('button')].find(button => button.textContent.includes('Guardar Cambios')).disabled).toBe(true);
  });

  test('allows saving after the organization loads successfully', async () => {
    mockGetOrganization.mockResolvedValue({ data: { name: 'Empresa Real', address: 'Calle 1' } });
    const rendered = await renderPage(); root = rendered.root;
    expect(rendered.host.querySelector('[role="alert"]')).toBeNull();
    expect([...rendered.host.querySelectorAll('button')].find(button => button.textContent.includes('Guardar Cambios')).disabled).toBe(false);
  });

  test('saves through the shared organization API client', async () => {
    mockGetOrganization.mockResolvedValue({ data: { name: 'Empresa Real', address: 'Calle 1' } });
    mockUpdateOrganization.mockResolvedValue({ data: {} });
    const rendered = await renderPage(); root = rendered.root;
    const form = rendered.host.querySelector('form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(mockUpdateOrganization).toHaveBeenCalledTimes(1);
    expect(mockUpdateOrganization.mock.calls[0][0]).toBe('org-1');
    expect(mockUpdateOrganization.mock.calls[0][1].name).toBe('Empresa Real');
  });

  test('switching to grooming for pets saves its matching portal theme', async () => {
    mockGetOrganization.mockResolvedValue({ data: { name: 'Patitas', business_type: 'barbershop', client_portal_theme: 'classic' } });
    mockUpdateOrganization.mockResolvedValue({ data: {} });
    const rendered = await renderPage(); root = rendered.root;
    const select = rendered.host.querySelector('[data-testid="business-type-select"]');
    await act(async () => { select.value = 'pet_grooming'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { rendered.host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(mockUpdateOrganization).toHaveBeenLastCalledWith('org-1', expect.objectContaining({ business_type: 'pet_grooming', client_portal_theme: 'pet-care' }));
  });

  test('keeps a chosen portal theme when the business type changes', async () => {
    mockGetOrganization.mockResolvedValue({ data: { name: 'Patitas', business_type: 'barbershop', client_portal_theme: 'noir' } });
    mockUpdateOrganization.mockResolvedValue({ data: {} });
    const rendered = await renderPage(); root = rendered.root;
    const select = rendered.host.querySelector('[data-testid="business-type-select"]');
    await act(async () => { select.value = 'pet_grooming'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(rendered.host.querySelector('[role="status"]').textContent).toContain('conserva el tema actual');
    await act(async () => { rendered.host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(mockUpdateOrganization).toHaveBeenLastCalledWith('org-1', expect.objectContaining({ business_type: 'pet_grooming', client_portal_theme: 'noir' }));
  });
});
