import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StaffIncome from './StaffIncome';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetSummary = jest.fn();
const mockGetTransactions = jest.fn();
const mockGetSettlementSummary = jest.fn();
const mockGetSettlements = jest.fn();
const mockGetTeamRanking = jest.fn();

jest.mock('../api', () => ({ staffIncomeAPI: { getSummary: (...args) => mockGetSummary(...args), getTransactions: (...args) => mockGetTransactions(...args), getSettlementSummary: (...args) => mockGetSettlementSummary(...args), getSettlements: (...args) => mockGetSettlements(...args), getSettlementById: jest.fn(), getTeamRanking: (...args) => mockGetTeamRanking(...args) } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children }) => <section>{children}</section>;
  return { ActionButton: ({ children, ...props }) => <button {...props}>{children}</button>, AnimatedNumber: ({ value }) => value, DetailDrawer: Box, EmptyState: ({ title }) => <p>{title}</p>, LoadingState: () => <p>Cargando</p>, MetricCard: ({ label, value }) => <div>{label}{value}</div>, MotionPage: Box, PageHeader: ({ title }) => <h1>{title}</h1>, ResponsiveDataView: ({ items }) => <div>{items.length}</div>, SegmentedControl: ({ options }) => <div>{options.map(option => <span key={option.value}>{option.label}</span>)}</div>, StatusBadge: Box, SurfaceCard: Box };
});

describe('StaffIncome', () => {
  let root;
  beforeEach(() => {
    mockGetSummary.mockResolvedValue({ data: {} });
    mockGetTransactions.mockResolvedValue({ data: [] });
    mockGetSettlementSummary.mockResolvedValue({ data: {} });
    mockGetSettlements.mockResolvedValue({ data: [] });
  });
  afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; root = null; jest.clearAllMocks(); });

  test('loads personal income without requesting or rendering a team ranking', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<StaffIncome />); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(mockGetSummary).toHaveBeenCalled();
    expect(mockGetTeamRanking).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Ranking del equipo');
  });
});
