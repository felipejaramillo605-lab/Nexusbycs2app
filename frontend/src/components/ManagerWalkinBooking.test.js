import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerWalkinBooking from './ManagerWalkinBooking';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockBarbers = jest.fn();
const mockServices = jest.fn();
const mockSlots = jest.fn();
const mockCreate = jest.fn();

jest.mock('../api', () => ({
  barberAPI: { getAll: (...args) => mockBarbers(...args) },
  publicAPI: { getServices: (...args) => mockServices(...args), getAvailability: (...args) => mockSlots(...args) },
  appointmentAPI: { createWalkin: (...args) => mockCreate(...args) },
}));
jest.mock('./design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, variant: _v, icon: _i, loading: _l, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

let container;
let root;

beforeEach(async () => {
  mockBarbers.mockResolvedValue({ data: [{ barber_id: 'b1', name: 'Carlos' }, { barber_id: 'b2', display_name: 'Dani' }] });
  mockServices.mockResolvedValue({ data: [{ service_id: 's1', name: 'Corte' }] });
  mockSlots.mockResolvedValue({ data: { available_slots: ['10:00', '10:30'] } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ManagerWalkinBooking organizationId="org_a" onDone={jest.fn()} onClose={jest.fn()} />);
  });
  await act(async () => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function choose(label, value) {
  const select = Array.from(container.querySelectorAll('label')).find((l) => l.textContent.startsWith(label)).querySelector('select');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function type(label, value) {
  const input = Array.from(container.querySelectorAll('label')).find((l) => l.textContent.startsWith(label)).querySelector('input');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('lists the professionals and services of the organization and loads their slots', async () => {
  expect(mockBarbers).toHaveBeenCalledWith({ organization_id: 'org_a' });
  expect(mockServices).toHaveBeenCalledWith('org_a');
  expect(container.textContent).toContain('Carlos');
  expect(container.textContent).toContain('Dani');
  await choose('Profesional', 'b2');
  await choose('Servicio', 's1');
  expect(mockSlots).toHaveBeenLastCalledWith('org_a', 'b2', expect.any(String), 's1');
  expect(container.textContent).toContain('10:30');
});

test('typing the client data keeps the chosen time and the request carries professional and organization', async () => {
  mockCreate.mockResolvedValue({ data: { appointment_id: 'apt_1' } });
  await choose('Profesional', 'b1');
  await choose('Servicio', 's1');
  await choose('Hora', '10:30');
  await type('Teléfono', '3001234567');
  await type('Nombre', 'Ana');
  expect(Array.from(container.querySelectorAll('label')).find((l) => l.textContent.startsWith('Hora')).querySelector('select').value).toBe('10:30');
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ barber_id: 'b1', service_id: 's1', time: '10:30', client_name: 'Ana', client_phone: '3001234567', client_email: '', organization_id: 'org_a' }),
  );
  expect(container.textContent).toContain('Cita confirmada');
  expect(container.textContent).toContain('Compartir por WhatsApp');
});

test('shows the server message when the slot is no longer available', async () => {
  mockCreate.mockRejectedValue({ response: { data: { detail: 'Time slot not available' } } });
  await choose('Profesional', 'b1');
  await choose('Servicio', 's1');
  await choose('Hora', '10:00');
  await type('Teléfono', '3001234567');
  await type('Nombre', 'Ana');
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector('[role=alert]').textContent).toContain('Time slot not available');
  expect(container.textContent).not.toContain('Cita confirmada');
});
