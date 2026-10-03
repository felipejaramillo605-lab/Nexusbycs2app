import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StaffAppointments from './StaffAppointments';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetAll = jest.fn();
const mockGetSummary = jest.fn();

jest.mock('../api', () => ({ staffAppointmentAPI: { getAll: (...args) => mockGetAll(...args), getSummary: (...args) => mockGetSummary(...args) } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children }) => <section>{children}</section>;
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => <button {...props}>{children}</button>,
    AnimatedNumber: ({ value }) => value,
    DetailDrawer: Box,
    EmptyState: ({ title }) => <p>{title}</p>,
    LoadingState: () => <p>Cargando</p>,
    MetricCard: ({ label, value }) => <div>{label}{value}</div>,
    MotionPage: Box,
    PageHeader: ({ title }) => <h1>{title}</h1>,
    ResponsiveDataView: ({ items, empty }) => (items.length ? <div>{items.length} citas</div> : empty),
    SegmentedControl: ({ value, options }) => <div data-active={value}>{options.map(option => <span key={option.value}>{option.label}</span>)}</div>,
    StatusBadge: Box,
    SurfaceCard: Box,
  };
});

describe('StaffAppointments', () => {
  let host;
  let root;

  beforeEach(() => {
    mockGetAll.mockResolvedValue({ data: [] });
    mockGetSummary.mockResolvedValue({ data: {} });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('opens on today: the first query covers a single day', async () => {
    await act(async () => { root.render(<StaffAppointments />); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(host.querySelector('[data-active]').getAttribute('data-active')).toBe('today');
    const params = mockGetAll.mock.calls[0][0];
    expect(params.start_date).toBe(params.end_date);
  });
});
