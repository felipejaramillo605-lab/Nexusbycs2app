import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerConnectors from './OwnerConnectors';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockStatus = jest.fn();
const mockEvents = jest.fn();

jest.mock('../api', () => ({
  ownerConnectorsAPI: {
    getStatus: (...args) => mockStatus(...args),
    getEmailEvents: (...args) => mockEvents(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, variant: _variant, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    MotionPage: ({ children }) => React.createElement('div', null, children),
    PageHeader: ({ title, actions }) => React.createElement('header', null, React.createElement('h1', null, title), actions),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

const OFF = {
  storage: { durable_provider: null, mongo_mirror: true },
  email: { provider: 'smtp', resend_enabled: false, resend_api_key_set: false, sender_set: false, webhook_secret_set: false, smtp_fallback_ready: true },
  decisions: { engine_enabled: false, jev_key_set: false },
};

let container;
let root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OwnerConnectors />);
  });
  await act(async () => {});
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

test('shows what is off by default and falls back to Gmail', async () => {
  mockStatus.mockResolvedValue({ data: OFF });
  mockEvents.mockResolvedValue({ data: { window_days: 7, counts: {}, suppressed: [] } });
  await mount();
  const text = container.textContent;
  expect(text).toContain('Almacenamiento durable (Cloudflare R2)');
  expect(text).toContain('Apagado');
  expect(text).toContain('Gmail (SMTP)');
  expect(text).toContain('Aún no hay eventos');
});

test('shows Resend active, event counts and masked suppressed addresses', async () => {
  mockStatus.mockResolvedValue({
    data: {
      ...OFF,
      storage: { durable_provider: 'cloudflare_r2', mongo_mirror: true },
      email: { ...OFF.email, resend_enabled: true, resend_api_key_set: true, sender_set: true, webhook_secret_set: true },
    },
  });
  mockEvents.mockResolvedValue({
    data: {
      window_days: 7,
      counts: { 'email.delivered': 12, 'email.bounced': 1 },
      suppressed: [{ address_masked: 'c***@example.com', reason: 'email.bounced', updated_at: 'x' }],
    },
  });
  await mount();
  const text = container.textContent;
  expect(text).toContain('Resend');
  expect(text).toContain('Entregados: 12');
  expect(text).toContain('Rebotados: 1');
  expect(text).toContain('c***@example.com');
});

test('shows an error with retry when the status cannot be loaded', async () => {
  mockStatus.mockRejectedValue(new Error('boom'));
  mockEvents.mockResolvedValue({ data: {} });
  await mount();
  expect(container.querySelector('[role="alert"]').textContent).toContain('No disponible');
});
