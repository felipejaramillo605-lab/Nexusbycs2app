import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerCapabilityGrants from './OwnerCapabilityGrants';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockListGrants = jest.fn();
const mockGrant = jest.fn();
const mockRevoke = jest.fn();
const mockGetUsers = jest.fn();
const mockConfirmAction = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../api', () => ({
  ownerAPI: { getUsers: (...args) => mockGetUsers(...args) },
  ownerCapabilityAPI: {
    listGrants: (...args) => mockListGrants(...args),
    grant: (...args) => mockGrant(...args),
    revoke: (...args) => mockRevoke(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    confirmAction: (...args) => mockConfirmAction(...args),
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title, actions }) => React.createElement('div', null, React.createElement('h1', null, title), actions),
    SurfaceCard: Box,
  };
});

const owner = (overrides = {}) => ({
  user_id: 'owner-1', name: 'Ana Owner', email: 'ana@nexus.com', role: 'owner', access_status: 'approved', active: true, ...overrides,
});

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OwnerCapabilityGrants />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

describe('OwnerCapabilityGrants', () => {
  let root;

  beforeEach(() => {
    mockListGrants.mockResolvedValue({
      data: {
        active_grants: [{ user_id: 'owner-1', granted_by_user_id: 'owner-0', granted_at: '2026-09-01T00:00:00+00:00', reason: 'Bootstrap' }],
        audit_events: [{ event_id: 'e1', type: 'granted', target_user_id: 'owner-1', reason: 'Bootstrap', created_at: '2026-09-01T00:00:00+00:00' }],
      },
    });
    mockGetUsers.mockResolvedValue({ data: [owner(), owner({ user_id: 'owner-2', name: 'Beto Owner', email: 'beto@nexus.com' })] });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('lists active grants and the eligible-owner dropdown excludes whoever already has it', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    expect(rendered.host.textContent).toContain('Ana Owner');
    const select = rendered.host.querySelector('select');
    const optionLabels = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(optionLabels).toContain('Beto Owner');
    expect(optionLabels).not.toContain('Ana Owner');
  });

  test('cannot revoke the sole remaining grant -- no revoke control is rendered for it', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const revokeButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('Revocar'));
    expect(revokeButton).toBeUndefined();
  });

  test('grants the capability to the selected owner with a reason', async () => {
    mockGrant.mockResolvedValue({ data: {} });
    const rendered = await renderPage();
    root = rendered.root;

    const select = rendered.host.querySelector('select');
    const textarea = rendered.host.querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'owner-2');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Nuevo administrador de billing');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('Otorgar permiso'));
    await act(async () => {
      submit.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGrant).toHaveBeenCalledWith({ user_id: 'owner-2', reason: 'Nuevo administrador de billing' });
  });

  test('revokes with a reason once a second grant exists and confirmation is accepted', async () => {
    mockListGrants.mockResolvedValue({
      data: {
        active_grants: [
          { user_id: 'owner-1', granted_by_user_id: 'owner-0', granted_at: '2026-09-01T00:00:00+00:00', reason: 'Bootstrap' },
          { user_id: 'owner-2', granted_by_user_id: 'owner-1', granted_at: '2026-09-05T00:00:00+00:00', reason: 'Backup admin' },
        ],
        audit_events: [],
      },
    });
    mockConfirmAction.mockResolvedValue(true);
    mockRevoke.mockResolvedValue({ data: {} });
    const rendered = await renderPage();
    root = rendered.root;

    const reasonInputs = rendered.host.querySelectorAll('input[placeholder="Motivo de la revocación"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(reasonInputs[0], 'Ya no administra facturación');
      reasonInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    });
    const revokeButtons = [...rendered.host.querySelectorAll('button')].filter((b) => b.textContent.includes('Revocar'));
    await act(async () => {
      revokeButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRevoke).toHaveBeenCalledWith('owner-1', { reason: 'Ya no administra facturación' });
  });
});
