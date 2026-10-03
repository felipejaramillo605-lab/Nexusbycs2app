import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AppointmentsHistory from './AppointmentsHistory';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockAppointment = { appointment_id: 'apt-1', client_name: 'Ana Cliente', client_phone: '+57 300 000 0000', date: '2026-09-30', time: '10:00', service_name: 'Corte', barber_name: 'Profesional', service_price: 30000, status: 'confirmed' };

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { items: [mockAppointment], total: 1, total_pages: 1 }, isLoading: false, error: null }),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org-1' } }) }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('../api', () => ({ appointmentAPI: { getAll: jest.fn(), checkout: jest.fn() } }));
jest.mock('../components/ui/skeleton', () => ({ TableSkeleton: () => null }));
jest.mock('../components/design', () => ({ AccessibleModal: ({ children }) => <div>{children}</div> }));

describe('AppointmentsHistory', () => {
  let root;
  afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; root = null; });

  test('renders client_name and client_phone returned by the appointments API', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<AppointmentsHistory />));
    expect(host.textContent).toContain('Ana Cliente');
    expect(host.textContent).toContain('+57 300 000 0000');
  });
});
