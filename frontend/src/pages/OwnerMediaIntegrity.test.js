import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerMediaIntegrity from './OwnerMediaIntegrity';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetReport = jest.fn();
const mockBackfill = jest.fn();
const mockConfirm = jest.fn();
const mockOrganizations = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../api', () => ({ ownerMediaIntegrityAPI: { getReport: (...args) => mockGetReport(...args) }, ownerAPI: { backfillObjectStorage: (...args) => mockBackfill(...args) }, thirdPartyMatrixAPI: { list: (...args) => mockOrganizations(...args) } }));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
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
  beforeEach(() => { mockGetReport.mockResolvedValue({ data: { broken: [] } }); mockOrganizations.mockResolvedValue({ data: { items: [] } }); mockConfirm.mockResolvedValue(true); });
  afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; root = null; jest.clearAllMocks(); });

  test('shows the non-error configuration message when durable storage is disabled', async () => {
    mockBackfill.mockResolvedValue({ data: { enabled: false, copied: 0, failed: 0 } });
    const rendered = await renderPage(); root = rendered.root;
    const button = [...rendered.host.querySelectorAll('button')].find((item) => item.textContent === 'Copiar medios a almacenamiento durable');
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mockBackfill).toHaveBeenCalledTimes(1);
    expect(rendered.host.textContent).toContain('Almacenamiento durable no configurado');
  });

  test('groups nonrecoverable media by organization and explains where to upload it', async () => {
    mockGetReport.mockResolvedValue({ data: { broken: [{ kind: 'professional_photo', organization_id: 'org-1', entity_id: 'p-1', url: '/media/p.png', recoverable_from_mirror: false }] } });
    mockOrganizations.mockResolvedValue({ data: { items: [{ organization_id: 'org-1', name: 'Clínica Aurora' }] } });
    const rendered = await renderPage(); root = rendered.root;
    expect(rendered.host.textContent).toContain('Clínica Aurora');
    expect(rendered.host.textContent).toContain('Equipo → abre el profesional → foto');
    const button = [...rendered.host.querySelectorAll('button')].find((item) => item.textContent === 'Abrir organización');
    await act(async () => { button.click(); });
    expect(mockNavigate).toHaveBeenCalledWith('/owner/organizations?organization_id=org-1');
  });
});
