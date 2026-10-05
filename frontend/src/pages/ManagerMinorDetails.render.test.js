import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerDashboard from './ManagerDashboard';
import ManagerInventory from './ManagerInventory';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetToday = jest.fn();
const mockGetServices = jest.fn();
const mockGetBarbers = jest.fn();
const mockGetSummary = jest.fn();
const mockGetOrganizations = jest.fn();
const mockGetCatalog = jest.fn();
const mockGetInventorySummary = jest.fn();
const mockListAudits = jest.fn();
const mockGetReorderAlerts = jest.fn();
const mockMigrateSkus = jest.fn();
const mockConfirmAction = jest.fn();
const mockSearchParams = new URLSearchParams();
const mockNavigate = jest.fn();
const mockSetSearchParams = jest.fn();

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'manager', organization_id: 'org-a', access_status: 'approved', name: 'Mara' }, logout: jest.fn(), checkAuth: jest.fn() }),
}));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useSearchParams: () => [mockSearchParams, mockSetSearchParams] }), { virtual: true });
jest.mock('../api', () => ({
  appointmentAPI: { getToday: (...args) => mockGetToday(...args) },
  serviceAPI: { getAll: (...args) => mockGetServices(...args) },
  barberAPI: { getAll: (...args) => mockGetBarbers(...args) },
  transactionAPI: { getSummary: (...args) => mockGetSummary(...args) },
  organizationAPI: { getAll: (...args) => mockGetOrganizations(...args) },
  inventoryAPI: {
    getCatalog: (...args) => mockGetCatalog(...args), getSummary: (...args) => mockGetInventorySummary(...args),
    listAudits: (...args) => mockListAudits(...args), getReorderAlerts: (...args) => mockGetReorderAlerts(...args),
    migrateSkus: (...args) => mockMigrateSkus(...args),
  },
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../components/DashboardStats', () => () => null);
jest.mock('../components/BookingTools', () => () => null);
jest.mock('../components/WeeklyCalendar', () => () => null);
jest.mock('../components/ui/dialog', () => ({ Dialog: ({ children }) => <>{children}</>, DialogContent: ({ children }) => <>{children}</>, DialogHeader: ({ children }) => <>{children}</>, DialogTitle: ({ children }) => <>{children}</> }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    AdminShell: ({ children }) => <>{children}</>, ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => <button type="button" {...props}>{children}</button>,
    AnimatedNumber: ({ value }) => <span>{String(value)}</span>, EmptyState: ({ title, action }) => <section>{title}{action}</section>,
    MetricCard: ({ label, value }) => <section><span>{label}</span>{value}</section>, MotionPage: ({ children }) => <main>{children}</main>,
    PageHeader: ({ title, actions }) => <header>{title}{actions}</header>, SegmentedControl: ({ options }) => <div>{options.map((option) => <button type="button" key={option.value}>{option.label}</button>)}</div>,
    SurfaceCard: ({ children }) => <section>{children}</section>, LoadingState: ({ label }) => <p>{label}</p>, DetailDrawer: ({ children }) => <aside>{children}</aside>, FieldGuide: ({ label }) => <span>{label}</span>,
    confirmAction: (...args) => mockConfirmAction(...args),
  };
});

async function renderPage(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

describe('Manager minor details', () => {
  let root;

  beforeEach(() => {
    mockGetOrganizations.mockResolvedValue({ data: [{ organization_id: 'org-a', name: 'Aurora' }] });
    mockGetToday.mockResolvedValue({ data: [] }); mockGetServices.mockResolvedValue({ data: [] }); mockGetSummary.mockResolvedValue({ data: { total_received: 0 } });
    mockGetBarbers.mockResolvedValue({ data: [{ barber_id: 'active', name: 'Profesional activo', active: true }, { barber_id: 'inactive', name: 'Profesional inactivo', active: false }, { barber_id: 'legacy', name: 'Profesional legado' }] });
    mockGetCatalog.mockResolvedValue({ data: [{ item_id: 'item-1', name: 'Shampoo', sku: '', quantity: 1, min_stock: 0, unit: 'unidades', unit_cost: 1, inventory_value: 1 }] });
    mockGetInventorySummary.mockResolvedValue({ data: {} }); mockListAudits.mockResolvedValue({ data: { items: [] } }); mockGetReorderAlerts.mockResolvedValue({ data: { total: 0, items: [] } });
    mockConfirmAction.mockResolvedValue(false);
  });

  afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; root = null; jest.clearAllMocks(); });

  test('counts loaded active professionals and exposes every professional in the filter', async () => {
    const rendered = await renderPage(<ManagerDashboard />); root = rendered.root;
    expect(rendered.host.textContent).toContain('Profesionales activos2');
    expect(rendered.host.textContent).toContain('Profesional activo');
    expect(rendered.host.textContent).toContain('Profesional inactivo');
    expect(rendered.host.textContent).toContain('Profesional legado');
  });

  test('asks before SKU normalization and does not call the API after cancellation', async () => {
    const rendered = await renderPage(<ManagerInventory />); root = rendered.root;
    const button = [...rendered.host.querySelectorAll('button')].find((item) => item.textContent.includes('Normalizar SKU'));
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mockConfirmAction).toHaveBeenCalledWith(expect.stringContaining('1 referencias'), expect.objectContaining({ title: 'Normalizar SKU' }));
    expect(mockMigrateSkus).not.toHaveBeenCalled();
  });
});
