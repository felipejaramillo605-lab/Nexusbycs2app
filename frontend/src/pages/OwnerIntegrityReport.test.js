import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerIntegrityReport from './OwnerIntegrityReport';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetReport = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../api', () => ({
  ownerIntegrityAPI: { getReport: (...args) => mockGetReport(...args) },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MetricCard: ({ label, value }) => React.createElement('div', null, label, value),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title, actions }) => React.createElement('div', null, React.createElement('h1', null, title), actions),
    ResponsiveDataView: ({ items, columns, empty }) => (items.length ? React.createElement('div', null, items.map((item, i) => React.createElement('div', { key: i }, columns.map((c) => React.createElement('span', { key: c.key }, c.render(item)))))) : empty),
    SegmentedControl: ({ options, value, onChange }) => React.createElement('div', null, options.map((o) => React.createElement('button', { key: o.value, type: 'button', 'aria-pressed': o.value === value, onClick: () => onChange(o.value) }, o.label))),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: Box,
  };
});

const finding = (overrides = {}) => ({
  domain: 'bookings',
  kind: 'orphaned_class_booking',
  organization_id: 'org-1',
  entity_type: 'class_booking',
  entity_id: 'cb-1',
  detail: 'class_session_id missing no existe',
  ...overrides,
});

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OwnerIntegrityReport />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

describe('OwnerIntegrityReport', () => {
  let root;

  beforeEach(() => {
    mockGetReport.mockResolvedValue({
      data: { summary: { bookings: 1, billing: 0, procurement: 0 }, total_findings: 1, findings: [finding()], mode: 'read_only' },
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('loads the report on mount and renders findings', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    expect(mockGetReport).toHaveBeenCalledWith({ domain: undefined });
    expect(rendered.host.textContent).toContain('Reserva sin clase');
  });

  test('filtering by domain passes it through to the request', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const billingButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent === 'Facturación');
    await act(async () => {
      billingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetReport).toHaveBeenLastCalledWith({ domain: 'billing' });
  });

  test('shows an empty state when there are no findings', async () => {
    mockGetReport.mockResolvedValue({ data: { summary: {}, total_findings: 0, findings: [], mode: 'read_only' } });
    const rendered = await renderPage();
    root = rendered.root;

    expect(rendered.host.textContent).toContain('Sin hallazgos');
  });

  test('the refresh action re-fetches the report', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const refreshButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent === 'Actualizar');
    await act(async () => {
      refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetReport).toHaveBeenCalledTimes(2);
  });
});
