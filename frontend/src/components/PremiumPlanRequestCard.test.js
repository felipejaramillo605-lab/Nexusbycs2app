import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PremiumPlanRequestCard from './PremiumPlanRequestCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetStatus = jest.fn();
const mockRequest = jest.fn();
jest.mock('../api', () => ({
  premiumPlanAPI: {
    createRequestId: () => 'stable-request-id',
    getStatus: (...args) => mockGetStatus(...args),
    request: (...args) => mockRequest(...args),
  },
}));

describe('PremiumPlanRequestCard', () => {
  let host;
  let root;

  const renderCard = async (status) => {
    mockGetStatus.mockResolvedValue({ data: { status } });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<PremiumPlanRequestCard />); });
  };

  afterEach(async () => {
    if (root) await act(async () => { root.unmount(); });
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('offers a request only when status is not_requested', async () => {
    await renderCard('not_requested');
    expect(host.textContent).toContain('Plan Premium');
    expect(host.querySelector('[data-testid="premium-plan-request-button"]')?.textContent).toContain('Solicitar plan Premium');
    expect(host.querySelector('[data-testid="premium-plan-request-card"]')).not.toBeNull();
  });

  test('shows pending and active as read-only states', async () => {
    await renderCard('pending');
    expect(host.textContent).toContain('Solicitud enviada');
    expect(host.querySelector('[data-testid="premium-plan-status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(host.querySelector('button')).toBeNull();
    await act(async () => { root.unmount(); });
    root = null;
    await renderCard('active');
    expect(host.textContent).toContain('Plan Premium activo');
    expect(host.querySelector('[data-testid="premium-plan-status"]')?.textContent).toContain('Plan Premium activo');
    expect(host.querySelector('button')).toBeNull();
  });

  test('fails closed for an unknown backend status', async () => {
    await renderCard('unexpected');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No se pudo consultar');
    expect(host.querySelector('button')?.textContent).toContain('Reintentar');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  test('sends a stable request id and refreshes on already pending conflict', async () => {
    await renderCard('not_requested');
    mockRequest.mockRejectedValueOnce({ response: { status: 409 } });
    mockGetStatus.mockResolvedValueOnce({ data: { status: 'pending' } });
    await act(async () => { host.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockRequest).toHaveBeenCalledWith('stable-request-id');
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Solicitud enviada');
    expect(host.querySelector('button')).toBeNull();
  });

  test('reuses the request id when the manager retries the same intention', async () => {
    await renderCard('not_requested');
    mockRequest.mockRejectedValueOnce(new Error('network error'));
    await act(async () => { host.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    mockGetStatus.mockResolvedValueOnce({ data: { status: 'not_requested' } });
    await act(async () => { host.querySelectorAll('button')[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { host.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockRequest.mock.calls).toEqual([['stable-request-id'], ['stable-request-id']]);
  });

  test('prevents synchronous double submission while the first request is unresolved', async () => {
    await renderCard('not_requested');
    let resolveRequest;
    mockRequest.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    await act(async () => {
      const button = host.querySelector('[data-testid="premium-plan-request-button"]');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
    await act(async () => { resolveRequest({ data: { status: 'pending' } }); });
    expect(host.textContent).toContain('Solicitud enviada');
  });
});
