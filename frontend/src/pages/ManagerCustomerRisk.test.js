import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerCustomerRisk from './ManagerCustomerRisk';

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockList = jest.fn();

jest.mock('../api', () => ({ customerRiskAPI: { list: (...args) => mockList(...args) } }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org-1' } }) }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }), { virtual: true });

test('shows local risk signals without a contact action', async () => {
  mockList.mockResolvedValue({ data: { items: [{ client_id: 'c1', band: 'high', score: 82, signals: { days_since_last_visit: 45, no_show_count: 2 } }] } });
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  await act(async () => { root.render(<ManagerCustomerRisk />); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(mockList).toHaveBeenCalledWith({ organization_id: 'org-1' });
  expect(host.textContent).toContain('Clientes en riesgo');
  expect(host.textContent).toContain('Nexus no contacta a nadie');
  expect(host.textContent).toContain('45 días sin visita');
  await act(async () => root.unmount());
});
