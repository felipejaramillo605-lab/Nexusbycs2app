jest.mock('axios', () => ({ create: jest.fn() }));

const axios = require('axios');
const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  interceptors: { response: { use: jest.fn() } },
};
axios.create.mockReturnValue(mockApi);
const { ownerPremiumPlanAPI, premiumPlanAPI } = require('./index');

describe('premiumPlanAPI', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reads status without sending an organization id', () => {
    premiumPlanAPI.getStatus();
    expect(mockApi.get).toHaveBeenCalledWith('/owner/platform-capabilities/premium-plan/status');
  });

  test('posts an empty body with the stable request id and no tenant parameter', () => {
    premiumPlanAPI.request('same-intent-id');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/owner/platform-capabilities/premium-plan-requests',
      {},
      { headers: { 'X-Request-ID': 'same-intent-id' } },
    );
  });
});

describe('ownerPremiumPlanAPI', () => {
  beforeEach(() => jest.clearAllMocks());

  test('lists owner requests on the owner-only route', () => {
    ownerPremiumPlanAPI.listRequests();
    expect(mockApi.get).toHaveBeenCalledWith('/owner/platform-capabilities/premium-plan-requests');
  });

  test('links an invoice and sends its request ID header', () => {
    const data = { invoice_id: 'invoice-1', reason: 'Premium solicitado' };
    ownerPremiumPlanAPI.linkInvoice('request-1', data, 'operation-1');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/owner/platform-capabilities/premium-plan-requests/request-1/invoice-link',
      data,
      { headers: { 'X-Request-ID': 'operation-1' } },
    );
  });

  test('sets entitlement with request and invoice references plus request ID header', () => {
    const data = { contracted: true, reason: 'Pagada', premium_request_id: 'request-1', invoice_id: 'invoice-1' };
    ownerPremiumPlanAPI.setEntitlement('org-1', data, 'operation-2');
    expect(mockApi.put).toHaveBeenCalledWith(
      '/owner/platform-capabilities/portal-templates/org-1/entitlement',
      data,
      { headers: { 'X-Request-ID': 'operation-2' } },
    );
  });
});
