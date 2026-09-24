import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerThirdPartyMatrix from './OwnerThirdPartyMatrix';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = jest.fn();
const mockList = jest.fn();
const mockDetail = jest.fn();
const mockListRequests = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('../api', () => ({
  ownerPremiumPlanAPI: { listRequests: (...args) => mockListRequests(...args) },
  thirdPartyMatrixAPI: {
    list: (...args) => mockList(...args),
    detail: (...args) => mockDetail(...args),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    AnimatedNumber: ({ value }) => value,
    DetailDrawer: ({ open, children }) => open ? React.createElement('div', null, children) : null,
    EmptyState: ({ title }) => React.createElement('p', null, title),
    MetricCard: ({ label, value }) => React.createElement('div', null, label, value),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    ResponsiveDataView: ({ items, columns }) => React.createElement('div', null, items.map(item => React.createElement('div', { key: item.organization_id }, columns[0].render(item)))),
    SegmentedControl: () => null,
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

describe('OwnerThirdPartyMatrix Premium summary', () => {
  let host;
  let root;

  beforeEach(() => {
    mockList.mockResolvedValue({ data: { items: [{ organization_id: 'org-1', name: 'Centro Uno', profile_status: 'complete' }], total: 1, total_pages: 1, page: 1 } });
    mockDetail.mockResolvedValue({ data: { organization: { organization_id: 'org-1', name: 'Centro Uno' }, fiscal_profile: {}, people: [] } });
    mockListRequests.mockResolvedValue({ data: { requests: [{ organization_id: 'org-1', status: 'active' }] } });
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

  test('shows Premium status read-only with a link and no legacy Nexus AI controls', async () => {
    await act(async () => root.render(<OwnerThirdPartyMatrix />));
    const openDetail = host.querySelector('button');
    await act(async () => {
      openDetail.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(host.querySelector('[data-testid="owner-premium-status"]').textContent).toContain('Activo');
    expect(host.textContent).toContain('Ver Plan Premium');
    expect(host.textContent).not.toContain('Retirar addon Nexus AI');
    expect(host.textContent).not.toContain('Marcar como contratado');
    const premiumLink = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Ver Plan Premium'));
    await act(async () => premiumLink.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(mockNavigate).toHaveBeenCalledWith('/owner/premium');
    expect(mockListRequests).toHaveBeenCalledTimes(1);
  });
});
