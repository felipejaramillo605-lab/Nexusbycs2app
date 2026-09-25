import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerSupportInbox from './OwnerSupportInbox';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockOwnerList = jest.fn();
const mockOwnerGet = jest.fn();
const mockOwnerSendMessage = jest.fn();
const mockGetAllOrgs = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../api', () => ({
  organizationAPI: { getAll: (...args) => mockGetAllOrgs(...args) },
  supportAPI: {
    ownerList: (...args) => mockOwnerList(...args),
    ownerGet: (...args) => mockOwnerGet(...args),
    ownerSendMessage: (...args) => mockOwnerSendMessage(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    DetailDrawer: ({ open, title, children }) => (open ? React.createElement('div', { 'data-testid': 'drawer' }, React.createElement('h2', null, title), children) : null),
    EmptyState: ({ title }) => React.createElement('p', null, title),
    LoadingState: () => React.createElement('p', null, 'Cargando'),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    ResponsiveDataView: ({ items, columns }) =>
      React.createElement(
        'div',
        null,
        items.map((item) => React.createElement('div', { key: item.conversation_id }, columns[0].render(item)))
      ),
    SegmentedControl: ({ options, onChange, value }) =>
      React.createElement(
        'div',
        null,
        options.map((option) =>
          React.createElement('button', { key: option.value, type: 'button', 'data-active': option.value === value, onClick: () => onChange(option.value) }, option.label)
        )
      ),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
  };
});

describe('OwnerSupportInbox', () => {
  let host;
  let root;

  beforeEach(() => {
    mockGetAllOrgs.mockResolvedValue({ data: [{ organization_id: 'org-1', name: 'Centro Uno' }] });
    mockOwnerList.mockResolvedValue({
      data: {
        items: [
          {
            conversation_id: 'supc_1',
            organization_id: 'org-1',
            subject: 'No puedo procesar un pago',
            status: 'waiting_owner',
            priority: 'high',
            channel: 'ticket',
            last_message_at: '2026-09-25T10:00:00Z',
          },
        ],
        page: 1,
        page_size: 25,
        total: 1,
        total_pages: 1,
      },
    });
    mockOwnerGet.mockResolvedValue({
      data: {
        conversation: { conversation_id: 'supc_1', organization_id: 'org-1', subject: 'No puedo procesar un pago', status: 'waiting_owner', priority: 'high', channel: 'ticket' },
        messages: [{ message_id: 'supm_1', sender_role: 'manager', body: 'Ayuda por favor', created_at: '2026-09-25T10:00:00Z' }],
      },
    });
    mockOwnerSendMessage.mockResolvedValue({
      data: {
        message: { message_id: 'supm_2', sender_role: 'owner', body: 'Ya lo reviso', created_at: '2026-09-25T10:05:00Z' },
        conversation: { conversation_id: 'supc_1', organization_id: 'org-1', subject: 'No puedo procesar un pago', status: 'waiting_organization', priority: 'high', channel: 'ticket' },
        idempotent: false,
      },
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('lists conversations with the organization name resolved and opens the detail drawer', async () => {
    await act(async () => {
      root.render(<OwnerSupportInbox />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.textContent).toContain('Centro Uno');
    expect(host.textContent).toContain('No puedo procesar un pago');

    const openButton = [...host.querySelectorAll('button')].find((button) => button.textContent.includes('Centro Uno'));
    await act(async () => {
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockOwnerGet).toHaveBeenCalledWith('supc_1');
    expect(host.querySelector('[data-testid="drawer"]').textContent).toContain('Ayuda por favor');
  });

  test('sends a reply with a fresh idempotency key and refreshes the list', async () => {
    await act(async () => {
      root.render(<OwnerSupportInbox />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const openButton = [...host.querySelectorAll('button')].find((button) => button.textContent.includes('Centro Uno'));
    await act(async () => {
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const textarea = host.querySelector('textarea');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => {
      nativeInputValueSetter.call(textarea, 'Ya lo reviso');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const sendButton = [...host.querySelectorAll('button')].find((button) => button.textContent.includes('Enviar respuesta'));
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockOwnerSendMessage).toHaveBeenCalledTimes(1);
    const [conversationId, payload] = mockOwnerSendMessage.mock.calls[0];
    expect(conversationId).toBe('supc_1');
    expect(payload.body).toBe('Ya lo reviso');
    expect(typeof payload.idempotency_key).toBe('string');
    expect(payload.idempotency_key.length).toBeGreaterThan(8);
    expect(mockOwnerList).toHaveBeenCalledTimes(2); // initial load + refresh after reply
  });

  test('does not show the reply box for a closed conversation', async () => {
    mockOwnerGet.mockResolvedValueOnce({
      data: {
        conversation: { conversation_id: 'supc_1', organization_id: 'org-1', subject: 'Cerrado', status: 'closed', priority: 'low', channel: 'chat' },
        messages: [],
      },
    });

    await act(async () => {
      root.render(<OwnerSupportInbox />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const openButton = [...host.querySelectorAll('button')].find((button) => button.textContent.includes('Centro Uno'));
    await act(async () => {
      openButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.querySelector('textarea')).toBeNull();
    expect(host.textContent).toContain('cerrada y no admite nuevas respuestas');
  });
});
