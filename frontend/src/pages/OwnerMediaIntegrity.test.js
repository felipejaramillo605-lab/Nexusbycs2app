import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerMediaIntegrity from './OwnerMediaIntegrity';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetReport = jest.fn();
const mockBackfill = jest.fn();
const mockConfirm = jest.fn();

jest.mock('../api', () => ({ ownerMediaIntegrityAPI: { getReport: (...args) => mockGetReport(...args) }, ownerAPI: { backfillObjectStorage: (...args) => mockBackfill(...args) } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, loading: _loading, icon: _icon, ...props }) => <button type="button" {...props}>{children}</button>,
    confirmAction: (...args) => mockConfirm(...args), EmptyState: ({ title }) => <p>{title}</p>, MotionPage: ({ children }) => <main>{children}</main>,
    PageHeader: ({ title, actions }) => <header>{title}{actions}</header>, ResponsiveDataView: () => null, StatusBadge: ({ children }) => <span>{children}</span>, SurfaceCard: ({ children }) => <section>{children}</section>,
  };
});

async function renderPage() {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<OwnerMediaIntegrity />); await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { host, root };
}

describe('OwnerMediaIntegrity', () => {
  let root;
  beforeEach(() => { mockGetReport.mockResolvedValue({ data: { broken: [] } }); mockConfirm.mockResolvedValue(true); });
  afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; root = null; jest.clearAllMocks(); });

  test('shows the non-error configuration message when durable storage is disabled', async () => {
    mockBackfill.mockResolvedValue({ data: { enabled: false, copied: 0, failed: 0 } });
    const rendered = await renderPage(); root = rendered.root;
    const button = [...rendered.host.querySelectorAll('button')].find((item) => item.textContent === 'Copiar medios a almacenamiento durable');
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mockBackfill).toHaveBeenCalledTimes(1);
    expect(rendered.host.textContent).toContain('Almacenamiento durable no configurado');
  });
});
