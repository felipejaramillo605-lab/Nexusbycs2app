import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MessagingPreference from './MessagingPreference';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn();
const mockSet = jest.fn();

jest.mock('../api', () => ({
  clientPortalAPI: { getMessagingConsent: (...a) => mockGet(...a), setMessagingConsent: (...a) => mockSet(...a) },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../context/OrganizationContext', () => ({ useOptionalOrganization: () => ({ organization: { operating_country: 'US' } }) }));

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MessagingPreference />); });
}

test('nothing is shown where consent is not required (Colombia)', async () => {
  mockGet.mockResolvedValue({ data: { required: false, enabled: true, reason: null } });
  await mount();
  expect(container.querySelector('[data-testid="messaging-preference"]')).toBeNull();
});

test('a US client sees the state and can turn texts on with the exact accepted text, or off (STOP)', async () => {
  mockGet.mockResolvedValue({ data: { required: true, enabled: false, reason: 'no_consent' } });
  mockSet.mockResolvedValue({ data: {} });
  await mount();
  const toggle = () => container.querySelector('[data-testid="messaging-preference"]');
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  expect(toggle().textContent).toContain('Text and WhatsApp messages');
  await act(async () => { toggle().click(); });
  expect(mockSet).toHaveBeenCalledTimes(1);
  expect(mockSet.mock.calls[0][0].enabled).toBe(true);
  expect(mockSet.mock.calls[0][0].text).toContain('Reply STOP to opt out');
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  await act(async () => { toggle().click(); });
  expect(mockSet.mock.calls[1][0]).toEqual({ enabled: false, text: undefined });
  expect(toggle().getAttribute('aria-checked')).toBe('false');
});
