import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerClients from './ManagerClients';
import { clientAPI, organizationAPI, membershipPlanAPI } from '../api';
import { toast } from 'sonner';

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org-a' }, logout: jest.fn() }) }));
jest.mock('../api', () => ({ clientAPI: { getAll: jest.fn(), getUpcomingBirthdays: jest.fn(), sendWhatsApp: jest.fn() }, organizationAPI: { getAll: jest.fn() }, membershipPlanAPI: { list: jest.fn() } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => ({ AccessibleModal: ({ children }) => <div role="dialog">{children}</div> }));
jest.mock('../components/ui/sheet', () => ({ Sheet: ({ children }) => <>{children}</>, SheetTrigger: ({ children }) => <>{children}</>, SheetContent: () => null, SheetHeader: () => null, SheetTitle: () => null }));

let root, host;
const click = async (label) => act(async () => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent.includes(label));
  if (!button) throw new Error(`Missing ${label}`);
  button.click();
});

async function render(consent = true) {
  clientAPI.getAll.mockResolvedValue({ data: { items: [{ client_id: 'c-a', name: 'Ana', phone: '300', accepts_marketing: consent }], total: 1 } });
  clientAPI.getUpcomingBirthdays.mockResolvedValue({ data: [] });
  organizationAPI.getAll.mockResolvedValue({ data: [{ organization_id: 'org-a', name: 'Empresa A' }] });
  membershipPlanAPI.list.mockResolvedValue({ data: [] });
  clientAPI.sendWhatsApp.mockResolvedValue({ data: { accepted: true, provider: 'mock' } });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<ManagerClients />));
  await click('Enviar Mensaje');
}

afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; jest.clearAllMocks(); });

test('sends a reminder by client ID and organization, without contact or placeholder content', async () => {
  await render();
  const button = [...host.querySelector('[role="dialog"]').querySelectorAll('button')].find(b => b.textContent.includes('Enviar Mensaje'));
  await act(async () => button.click());
  expect(clientAPI.sendWhatsApp).toHaveBeenCalledWith('c-a', { kind: 'reminder', organization_id: 'org-a' });
  expect(toast.success).toHaveBeenCalledWith('✅ Mensaje registrado (modo prueba)');
});

test('blocks promotions for a client without marketing consent', async () => {
  await render(false); await click('Promoción');
  const dialog = host.querySelector('[role="dialog"]');
  expect(dialog.querySelector('[role="alert"]').textContent).toContain('no autorizó');
  expect([...dialog.querySelectorAll('button')].find(b => b.textContent.includes('Enviar Mensaje')).disabled).toBe(true);
  expect(clientAPI.sendWhatsApp).not.toHaveBeenCalled();
});

test('sends the promotion typed by the manager rather than an invented discount', async () => {
  await render(); await click('Promoción');
  await act(async () => {
    const input = host.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Oferta escrita');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const button = [...host.querySelector('[role="dialog"]').querySelectorAll('button')].find(b => b.textContent.includes('Enviar Mensaje'));
  await act(async () => button.click());
  expect(clientAPI.sendWhatsApp).toHaveBeenCalledWith('c-a', { kind: 'promotion', organization_id: 'org-a', message: 'Oferta escrita' });
});

test('searching keeps the search form mounted instead of replacing the page with a spinner', async () => {
  await render();
  const input = host.querySelector('#client-search');
  let resolveSearch;
  clientAPI.getAll.mockImplementationOnce(() => new Promise(resolve => { resolveSearch = resolve; }));
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Ana');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { host.querySelector('form[role="search"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(host.querySelector('#client-search')).toBe(input);
  expect(host.textContent).not.toContain('Cargando clientes');
  expect(host.querySelector('[role="status"]').textContent).toContain('Actualizando');
  await act(async () => resolveSearch({ data: { items: [], total: 0 } }));
  expect(host.querySelector('#client-search')).toBe(input);
});
