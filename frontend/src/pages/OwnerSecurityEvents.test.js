import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerSecurityEvents from './OwnerSecurityEvents';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockListEvents = jest.fn();
const mockGetSummary = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../api', () => ({
  ownerSecurityAPI: {
    listEvents: (...args) => mockListEvents(...args),
    getEventsSummary: (...args) => mockGetSummary(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    AnimatedNumber: ({ value }) => value,
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MetricCard: ({ label, value }) => React.createElement('div', null, label, value),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    ResponsiveDataView: ({ items, columns }) => React.createElement('div', null, items.map((item) => React.createElement('div', { key: item.security_event_id }, columns.map((c) => React.createElement('span', { key: c.key }, c.render(item)))))),
    SegmentedControl: ({ options, value, onChange }) => React.createElement('div', null, options.map((o) => React.createElement('button', { key: o.value, type: 'button', 'aria-pressed': o.value === value, onClick: () => onChange(o.value) }, o.label))),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: Box,
  };
});

const event = (overrides = {}) => ({
  security_event_id: 'sevt_1',
  event_type: 'origin_blocked',
  severity: 'warning',
  diagnostic_code: 'SEC-ORG-ABCDEF12',
  request_method: 'POST',
  normalized_path: '/api/owner/users/:id',
  source_fingerprint: 'fp-abc123',
  occurrence_count: 4,
  last_seen_at: '2026-09-27T10:05:00+00:00',
  ...overrides,
});

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OwnerSecurityEvents />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

describe('OwnerSecurityEvents', () => {
  let root;

  beforeEach(() => {
    mockListEvents.mockResolvedValue({ data: { items: [event()], page: 1, page_size: 25, total: 1, total_pages: 1, has_previous: false, has_next: false } });
    mockGetSummary.mockResolvedValue({ data: { by_event_type: [{ event_type: 'origin_blocked', count: 1, occurrences: 4 }], total_events: 1, total_occurrences: 4 } });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('lists security events on load and renders the fingerprint, never a raw identity', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    expect(mockListEvents).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 25 }));
    expect(rendered.host.textContent).toContain('fp-abc123');
    expect(rendered.host.textContent).toContain('Origen bloqueado');
  });

  test('renders the summary metrics from the summary endpoint', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    expect(mockGetSummary).toHaveBeenCalledTimes(1);
    expect(rendered.host.textContent).toContain('Ocurrencias totales');
  });

  test('filtering by severity resets to page 1 and passes the filter through', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const highButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent === 'Alta');
    await act(async () => {
      highButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockListEvents).toHaveBeenLastCalledWith(expect.objectContaining({ severity: 'high', page: 1 }));
  });

  test('filtering by event type passes the type through', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const typeButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent === 'Acceso entre organizaciones bloqueado');
    await act(async () => {
      typeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockListEvents).toHaveBeenLastCalledWith(expect.objectContaining({ event_type: 'cross_tenant_access_blocked', page: 1 }));
  });
});
