import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerAccessControl from './OwnerAccessControl';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockGetUsers = jest.fn();
const mockGetAllOrgs = jest.fn();
const mockListSessions = jest.fn();
const mockRevokeAllSessions = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../context/AuthContext', () => ({ useAuth: (...args) => mockUseAuth(...args) }));
jest.mock('../api', () => ({
  ownerAPI: { getUsers: (...args) => mockGetUsers(...args), updateAccess: jest.fn(), recoverOrganizationRole: jest.fn(), deleteUser: jest.fn() },
  organizationAPI: { getAll: (...args) => mockGetAllOrgs(...args) },
  ownerAccessSessionsAPI: {
    createRequestId: () => 'req-test-fixed',
    list: (...args) => mockListSessions(...args),
    revokeAll: (...args) => mockRevokeAllSessions(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    AccessibleModal: ({ children, open }) => (open ? React.createElement('div', { role: 'dialog' }, children) : null),
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    AnimatedNumber: ({ value }) => value,
    DetailDrawer: ({ open, children }) => (open ? React.createElement('div', null, children) : null),
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MetricCard: ({ label, value }) => React.createElement('div', null, label, value),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title, actions }) => React.createElement('header', null, React.createElement('h1', null, title), actions),
    ResponsiveDataView: ({ items, columns }) => React.createElement('div', null, items.map((item) => React.createElement('button', { key: item.user_id, type: 'button', onClick: () => columns[0].render(item).props.onClick() }, item.name))),
    SegmentedControl: () => null,
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: Box,
  };
});

const staffMember = { user_id: 'staff-1', name: 'Feli Staff', email: 'feli@nexus.com', role: 'staff', access_status: 'approved', organization_id: 'org-1' };

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OwnerAccessControl />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

const openDetail = async (host, name) => {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent === name);
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('OwnerAccessControl sessions', () => {
  let root;

  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { user_id: 'owner-self' } });
    mockGetUsers.mockResolvedValue({ data: [staffMember] });
    mockGetAllOrgs.mockResolvedValue({ data: [{ organization_id: 'org-1', name: 'Org Uno' }] });
    mockListSessions.mockResolvedValue({
      data: {
        active_count: 2,
        sessions: [
          { session_ref: 'ref-1', created_at: '2026-09-20T10:00:00+00:00', expires_at: '2026-09-27T10:00:00+00:00' },
          { session_ref: 'ref-2', created_at: '2026-09-21T10:00:00+00:00', expires_at: '2026-09-28T10:00:00+00:00' },
        ],
        next_cursor: null,
      },
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('loads and shows a user\'s active session count when the detail drawer opens', async () => {
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Feli Staff');

    expect(mockListSessions).toHaveBeenCalledWith('staff-1');
    const block = rendered.host.querySelector('[data-testid="owner-user-sessions"]');
    expect(block.textContent).toContain('2');
  });

  test('returns to the Owner home instead of the Manager dashboard', async () => {
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Volver al inicio');

    expect(mockNavigate).toHaveBeenCalledWith('/owner');
    expect(mockNavigate).not.toHaveBeenCalledWith('/manager/dashboard');
  });

  test('distinguishes a failed sessions check from zero sessions and recovers on retry', async () => {
    mockListSessions.mockRejectedValueOnce(new Error('Unavailable'));
    mockListSessions.mockResolvedValueOnce({ data: { active_count: 0, sessions: [], next_cursor: null } });
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Feli Staff');

    const block = rendered.host.querySelector('[data-testid="owner-user-sessions"]');
    expect(block.querySelector('strong').textContent).toBe('No se pudo verificar');
    expect(rendered.host.querySelector('[role="alert"]').textContent).toContain('No se pudo verificar');
    await openDetail(rendered.host, 'Reintentar');

    expect(mockListSessions).toHaveBeenCalledTimes(2);
    expect(mockListSessions).toHaveBeenLastCalledWith('staff-1');
    expect(block.querySelector('strong').textContent).toBe('0');
    expect(rendered.host.querySelector('[role="alert"]')).toBeNull();
    expect(rendered.host.textContent).not.toContain('Reintentar');
  });

  test('loads the next cursor and appends sessions without losing the first page', async () => {
    mockListSessions.mockResolvedValueOnce({ data: { active_count: 2, sessions: [{ session_ref: 'first', created_at: '2026-09-21' }], next_cursor: 'cursor-next' } });
    mockListSessions.mockResolvedValueOnce({ data: { active_count: 2, sessions: [{ session_ref: 'second', created_at: '2026-09-20' }], next_cursor: null } });
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Feli Staff');
    expect(rendered.host.textContent).toContain('Creada 2026-09-21');
    await openDetail(rendered.host, 'Cargar mas');

    expect(mockListSessions).toHaveBeenCalledTimes(2);
    expect(mockListSessions).toHaveBeenLastCalledWith('staff-1', { cursor: 'cursor-next' });
    const rows = [...rendered.host.querySelectorAll('.nexus-audit-list li')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Creada 2026-09-21');
    expect(rows[1].textContent).toContain('Creada 2026-09-20');
    expect(rendered.host.textContent).not.toContain('Cargar mas');
  });

  test('retains the first page after a pagination failure and retries the same cursor', async () => {
    mockListSessions.mockResolvedValueOnce({ data: { active_count: 2, sessions: [{ session_ref: 'first', created_at: '2026-09-21' }], next_cursor: 'retry-cursor' } });
    mockListSessions.mockRejectedValueOnce(new Error('Unavailable'));
    mockListSessions.mockResolvedValueOnce({ data: { active_count: 2, sessions: [{ session_ref: 'second', created_at: '2026-09-20' }], next_cursor: null } });
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Feli Staff');
    await openDetail(rendered.host, 'Cargar mas');

    expect(rendered.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(rendered.host.textContent).toContain('Creada 2026-09-21');
    await openDetail(rendered.host, 'Reintentar');

    expect(mockListSessions).toHaveBeenNthCalledWith(2, 'staff-1', { cursor: 'retry-cursor' });
    expect(mockListSessions).toHaveBeenNthCalledWith(3, 'staff-1', { cursor: 'retry-cursor' });
    expect(rendered.host.querySelectorAll('.nexus-audit-list li')).toHaveLength(2);
    expect(rendered.host.querySelector('[role="alert"]')).toBeNull();
  });

  test('ignores a late sessions response after selecting another user', async () => {
    let resolveFirst;
    mockGetUsers.mockResolvedValue({ data: [staffMember, { ...staffMember, user_id: 'staff-2', name: 'Otro Staff' }] });
    mockListSessions.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    mockListSessions.mockResolvedValueOnce({ data: { active_count: 0, sessions: [], next_cursor: null } });
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Feli Staff');
    expect(rendered.host.querySelector('[data-testid="owner-user-sessions"] strong').textContent).toContain('Cargando');
    await openDetail(rendered.host, 'Otro Staff');
    await act(async () => {
      resolveFirst({ data: { active_count: 1, sessions: [{ session_ref: 'old', created_at: '2026-09-21' }], next_cursor: null } });
    });

    expect(mockListSessions).toHaveBeenLastCalledWith('staff-2');
    expect(rendered.host.querySelector('[data-testid="owner-user-sessions"] strong').textContent).toBe('0');
    expect(rendered.host.textContent).not.toContain('Creada 2026-09-21');
  });

  test('revokes all sessions for the selected user with a reason and a fresh idempotency key', async () => {
    mockRevokeAllSessions.mockResolvedValue({ data: { revoked_count: 2, idempotent_replay: false } });
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Feli Staff');

    const textarea = rendered.host.querySelector('textarea[minlength]') || [...rendered.host.querySelectorAll('textarea')].find((t) => t.minLength === 10);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'El equipo dejó de trabajar aquí');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const revokeButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('Cerrar todas las sesiones'));
    await act(async () => {
      revokeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRevokeAllSessions).toHaveBeenCalledWith('staff-1', { reason: 'El equipo dejó de trabajar aquí' }, 'req-test-fixed');
  });

  test('does not offer a revoke control for the currently signed-in owner\'s own row', async () => {
    mockGetUsers.mockResolvedValue({ data: [{ user_id: 'owner-self', name: 'Yo Mismo', email: 'yo@nexus.com', role: 'owner', access_status: 'approved' }] });
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Yo Mismo');

    expect(rendered.host.textContent).not.toContain('Cerrar todas las sesiones');
  });

  test('hides the revoke control when there are no active sessions to revoke', async () => {
    mockListSessions.mockResolvedValue({ data: { active_count: 0, sessions: [], next_cursor: null } });
    const rendered = await renderPage();
    root = rendered.root;
    await openDetail(rendered.host, 'Feli Staff');

    expect(rendered.host.textContent).not.toContain('Cerrar todas las sesiones');
  });

  test('shows unavailable counters and retries when the access list fails to load', async () => {
    mockGetUsers.mockRejectedValueOnce(new Error('Unavailable'));
    mockGetUsers.mockResolvedValueOnce({ data: [staffMember] });
    const rendered = await renderPage();
    root = rendered.root;

    expect(rendered.host.textContent).toContain('No disponible');
    expect(rendered.host.querySelector('[role="alert"]').textContent).toContain('no representan cero usuarios');
    await openDetail(rendered.host, 'Reintentar');

    expect(mockGetUsers).toHaveBeenCalledTimes(2);
    expect(rendered.host.querySelector('[role="alert"]')).toBeNull();
    expect(rendered.host.textContent).toContain('1');
  });
});
