import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MarketingCampaigns from './MarketingCampaigns';
import { clientAPI, organizationAPI, serviceAPI, templateAPI, marketingAPI } from '../api';
import { toast } from 'sonner';

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org-a' }, logout: jest.fn() }) }));
jest.mock('../api', () => ({ clientAPI: { getAll: jest.fn(), getUpcomingBirthdays: jest.fn(), sendWhatsApp: jest.fn() }, organizationAPI: { getAll: jest.fn() }, serviceAPI: { getAll: jest.fn() }, templateAPI: { list: jest.fn(), variables: jest.fn() }, marketingAPI: { sendCampaign: jest.fn() } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => ({ AccessibleModal: ({ children }) => <>{children}</> }));

let root, host;
const button = (label) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label));
async function render(consent = true) {
  clientAPI.getAll.mockResolvedValue({ data: { items: [{ client_id: 'c-a', name: 'Ana', phone: '300', accepts_marketing: consent }] } });
  clientAPI.getUpcomingBirthdays.mockResolvedValue({ data: [] });
  organizationAPI.getAll.mockResolvedValue({ data: [{ organization_id: 'org-a', name: 'Empresa A' }] });
  serviceAPI.getAll.mockResolvedValue({ data: [] });
  templateAPI.list.mockResolvedValue({ data: { templates: [], variables: [] } });
  clientAPI.sendWhatsApp.mockResolvedValue({ data: { accepted: true, provider: 'mock' } });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<MarketingCampaigns />));
}
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; jest.clearAllMocks(); });

test('uses the protected client WhatsApp endpoint for campaign delivery', async () => {
  await render();
  await act(async () => button('Seleccionar Todo').click());
  await act(async () => {
    const input = host.querySelector('[aria-label="Mensaje de campaña"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Oferta real');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Enviar a').click());
  expect(clientAPI.sendWhatsApp).toHaveBeenCalledWith('c-a', { kind: 'promotion', organization_id: 'org-a', message: 'Oferta real' });
  expect(marketingAPI.sendCampaign).not.toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1 WhatsApp (modo prueba)'));
});

test('does not offer clients without consent as campaign recipients', async () => {
  await render(false);
  expect(host.textContent).not.toContain('Ana');
  expect(button('Enviar a').disabled).toBe(true);
  expect(clientAPI.sendWhatsApp).not.toHaveBeenCalled();
});

test('reports a server-side consent rejection as a failed send', async () => {
  await render();
  clientAPI.sendWhatsApp.mockRejectedValue({ response: { status: 403, data: { detail: 'Consentimiento revocado' } } });
  await act(async () => button('Seleccionar Todo').click());
  await act(async () => {
    const input = host.querySelector('[aria-label="Mensaje de campaña"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Oferta real');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Enviar a').click());
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No enviados: 1 WhatsApp'));
});
