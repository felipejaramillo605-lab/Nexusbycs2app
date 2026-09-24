jest.mock('axios', () => ({ create: jest.fn() }));

const axios = require('axios');
const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  interceptors: { response: { use: jest.fn() } },
};
axios.create.mockReturnValue(mockApi);
const { premiumPlanAPI } = require('./index');

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
