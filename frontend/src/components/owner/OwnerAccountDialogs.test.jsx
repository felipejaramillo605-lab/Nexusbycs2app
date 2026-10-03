import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { AddOwnerDialog } from './AddOwnerDialog';
import { DeleteOrganizationDialog } from './DeleteOrganizationDialog';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockAddOwner = jest.fn();
const mockImpact = jest.fn();
const mockDelete = jest.fn();

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../api', () => ({
  ownerAPI: {
    addOwner: (...args) => mockAddOwner(...args),
    getDeletionImpact: (...args) => mockImpact(...args),
    deleteOrganization: (...args) => mockDelete(...args),
  },
}));
jest.mock('../design', () => {
  const React = jest.requireActual('react');
  return {
    AccessibleModal: ({ open, children }) => (open ? React.createElement('div', { role: 'dialog' }, children) : null),
    ActionButton: ({ children, variant: _variant, ...props }) => React.createElement('button', props, children),
  };
});

const type = async (element, value) => act(async () => {
  const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});
const submit = async (host) => act(async () => {
  host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
});
const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label));

describe('owner account dialogs', () => {
  let host;
  let root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('add owner needs a valid email and a real reason, and explains the invitation result', async () => {
    mockAddOwner.mockResolvedValue({ data: { result: 'invited', email: 'nuevo@example.com' } });
    const onDone = jest.fn();
    await act(async () => root.render(<AddOwnerDialog open onClose={jest.fn()} onDone={onDone} />));
    expect(button(host, 'Agregar Owner').disabled).toBe(true);
    await type(host.querySelector('#add-owner-email'), 'no-es-correo');
    await type(host.querySelector('#add-owner-reason'), 'Alta autorizada');
    expect(button(host, 'Agregar Owner').disabled).toBe(true);
    await type(host.querySelector('#add-owner-email'), 'nuevo@example.com');
    expect(button(host, 'Agregar Owner').disabled).toBe(false);
    await submit(host);
    expect(mockAddOwner).toHaveBeenCalledWith('nuevo@example.com', 'Alta autorizada');
    expect(toast.success.mock.calls[0][0]).toContain('iniciar sesión con Google');
    expect(onDone).toHaveBeenCalled();
  });

  test('add owner shows the server error instead of failing silently', async () => {
    mockAddOwner.mockRejectedValue({ response: { data: { detail: 'Esa cuenta fue eliminada' } } });
    await act(async () => root.render(<AddOwnerDialog open onClose={jest.fn()} />));
    await type(host.querySelector('#add-owner-email'), 'gone@example.com');
    await type(host.querySelector('#add-owner-reason'), 'Alta autorizada');
    await submit(host);
    expect(toast.error).toHaveBeenCalledWith('Esa cuenta fue eliminada');
  });

  test('delete organization shows the impact and only enables with the exact name and a reason', async () => {
    mockImpact.mockResolvedValue({ data: { users: 3, upcoming_appointments: 2, clients: 40, enabled_owners: 0 } });
    mockDelete.mockResolvedValue({ data: { users_removed: 3 } });
    const onDeleted = jest.fn();
    await act(async () => { root.render(<DeleteOrganizationDialog organization={{ organization_id: 'org_a', name: 'Barbería Central' }} onClose={jest.fn()} onDeleted={onDeleted} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    const impact = host.querySelector('[data-testid="delete-org-impact"]').textContent;
    expect(impact).toContain('3 cuenta(s)');
    expect(impact).toContain('no se cancelan ni se avisa');
    expect(button(host, 'Eliminar definitivamente').disabled).toBe(true);
    await type(host.querySelector('#delete-org-name'), 'Otra');
    await type(host.querySelector('#delete-org-reason'), 'Cierre del negocio');
    expect(button(host, 'Eliminar definitivamente').disabled).toBe(true);
    await type(host.querySelector('#delete-org-name'), '  barbería   central ');
    expect(button(host, 'Eliminar definitivamente').disabled).toBe(false);
    await submit(host);
    expect(mockDelete).toHaveBeenCalledWith('org_a', { confirm_name: 'barbería   central', reason: 'Cierre del negocio' });
    expect(onDeleted).toHaveBeenCalled();
  });

  test('an organization that still has an Owner account cannot be deleted from the dialog', async () => {
    mockImpact.mockResolvedValue({ data: { users: 1, upcoming_appointments: 0, clients: 0, enabled_owners: 1 } });
    await act(async () => { root.render(<DeleteOrganizationDialog organization={{ organization_id: 'org_b', name: 'Spa B' }} onClose={jest.fn()} />); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.querySelector('[role="alert"]').textContent).toContain('Owner vinculada');
    expect(host.querySelector('#delete-org-name').disabled).toBe(true);
    expect(button(host, 'Eliminar definitivamente').disabled).toBe(true);
  });
});
