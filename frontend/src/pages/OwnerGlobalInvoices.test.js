import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerGlobalInvoices from './OwnerGlobalInvoices';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetAllInvoices = jest.fn();
const mockGetBillingSummary = jest.fn();
const mockDownloadPdf = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../api', () => ({
  subscriptionAPI: {
    getAllInvoices: (...args) => mockGetAllInvoices(...args),
    getBillingSummary: (...args) => mockGetBillingSummary(...args),
  },
  billingAPI: { downloadPdf: (...args) => mockDownloadPdf(...args) },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    AnimatedNumber: ({ value }) => value,
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MetricCard: ({ label, value }) => React.createElement('div', null, label, value),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    ResponsiveDataView: ({ items, columns }) => React.createElement('div', null, items.map((item) => React.createElement('div', { key: item.invoice_id }, columns.map((c) => React.createElement('span', { key: c.key }, c.render(item))))))
    ,
    SegmentedControl: ({ options, value, onChange }) => React.createElement('div', null, options.map((o) => React.createElement('button', { key: o.value, type: 'button', 'aria-pressed': o.value === value, onClick: () => onChange(o.value) }, o.label))),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: Box,
  };
});

const invoice = (overrides = {}) => ({
  invoice_id: 'inv-1',
  invoice_number: 'NEX-0001',
  organization_id: 'org-1',
  status: 'pending',
  amount_minor: 8_000_000,
  currency: 'COP',
  due_at: '2026-09-10T00:00:00+00:00',
  issued_at: '2026-09-01T00:00:00+00:00',
  buyer_snapshot: { organization_name: 'Org Uno', legal_name: 'Org Uno SAS' },
  ...overrides,
});

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<OwnerGlobalInvoices />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

describe('OwnerGlobalInvoices', () => {
  let root;

  beforeEach(() => {
    mockGetAllInvoices.mockResolvedValue({ data: { items: [invoice()], page: 1, page_size: 25, total: 1, total_pages: 1, has_previous: false, has_next: false } });
    mockGetBillingSummary.mockResolvedValue({ data: { currency: 'COP', total_pending_minor: 8_000_000, organizations_with_balance: 1, invoice_count: 1, buckets: { current: { total_minor: 8_000_000, count: 1 }, d1_30: { total_minor: 0, count: 0 }, d31_60: { total_minor: 0, count: 0 }, d60_plus: { total_minor: 0, count: 0 } } } });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('lists invoices across organizations on load, with no organization filter required', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    expect(mockGetAllInvoices).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 25 }));
    expect(rendered.host.textContent).toContain('Org Uno');
    expect(rendered.host.textContent).toContain('NEX-0001');
  });

  test('renders the cross-organization summary metrics from billing/summary', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    expect(mockGetBillingSummary).toHaveBeenCalledTimes(1);
    expect(rendered.host.textContent).toContain('Organizaciones con saldo');
  });

  test('re-fetches with the search term applied on submit', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const input = rendered.host.querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'barberia');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetAllInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'barberia', page: 1 }));
  });

  test('filtering by the Premium-surcharge type resets to page 1 and passes invoice_type through', async () => {
    const rendered = await renderPage();
    root = rendered.root;

    const surchargeButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent === 'Excedente Premium');
    await act(async () => {
      surchargeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetAllInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ invoice_type: 'premium_surcharge', page: 1 }));
  });

  test('downloads the PDF scoped to that invoice\'s own organization_id', async () => {
    mockDownloadPdf.mockResolvedValue({ data: new Blob(['x']) });
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();

    const rendered = await renderPage();
    root = rendered.root;

    const pdfButton = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('PDF'));
    await act(async () => {
      pdfButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockDownloadPdf).toHaveBeenCalledWith('inv-1', { organization_id: 'org-1' });

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevoke;
  });
});
