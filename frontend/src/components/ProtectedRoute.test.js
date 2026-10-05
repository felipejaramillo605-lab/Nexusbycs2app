import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedRoute from './ProtectedRoute';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockStatus = jest.fn();
let mockUser;
let mockPath;

jest.mock('../api', () => ({ legalAPI: { getStatus: (...args) => mockStatus(...args) } }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false, subscriptionSuspended: false }),
}));
jest.mock('react-router-dom', () => {
  const React = jest.requireActual('react');
  return {
    Navigate: ({ to }) => React.createElement('div', null, `REDIRECT:${to}`),
    useLocation: () => ({ pathname: mockPath }),
  };
}, { virtual: true });
jest.mock('../lib/roleNavigation', () => ({ getHomeForRole: () => '/home' }));
jest.mock('./billing/SubscriptionSuspended', () => () => null);

let container;
let root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ProtectedRoute><span>CONTENIDO</span></ProtectedRoute>);
  });
  await act(async () => {});
}

beforeEach(() => {
  mockUser = { user_id: 'u1', role: 'manager', access_status: 'approved' };
  mockPath = '/dashboard';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

test('a user who has not accepted the current contract is sent to the contract page', async () => {
  mockStatus.mockResolvedValue({ data: { accepted: false, version: '2.0' } });
  await mount();
  expect(container.textContent).toBe('REDIRECT:/legal/contrato');
});

test('a user who accepted gets the page', async () => {
  mockStatus.mockResolvedValue({ data: { accepted: true, version: '2.0' } });
  await mount();
  expect(container.textContent).toBe('CONTENIDO');
});

test('the contract page itself is never redirected', async () => {
  mockPath = '/legal/contrato';
  mockStatus.mockResolvedValue({ data: { accepted: false, version: '2.0' } });
  await mount();
  expect(container.textContent).toBe('CONTENIDO');
});

test('the owner is exempt and does not even query the status', async () => {
  mockUser = { user_id: 'u0', role: 'owner', access_status: 'approved' };
  await mount();
  expect(container.textContent).toBe('CONTENIDO');
  expect(mockStatus).not.toHaveBeenCalled();
});

test('a failed status check does not lock anyone out', async () => {
  mockStatus.mockRejectedValue(new Error('network'));
  await mount();
  expect(container.textContent).toBe('CONTENIDO');
});
