jest.mock('axios', () => ({ create: jest.fn() }));

const axios = require('axios');
const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  interceptors: { response: { use: jest.fn() } },
};
axios.create.mockReturnValue(mockApi);

const { nexusAiAPI } = require('./index');

describe('nexusAiAPI.streamMessage', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  test('uses the normalized API origin and keeps the streaming response intact', async () => {
    const response = { status: 200, ok: true, body: {} };
    global.fetch.mockResolvedValue(response);

    await expect(nexusAiAPI.streamMessage('conv-1', { message: 'Hola' }, { organization_id: 'org-1' }))
      .resolves.toBe(response);

    expect(global.fetch).toHaveBeenCalledWith(
      `${window.location.origin}/api/nexus-ai/conversations/conv-1/messages?organization_id=org-1`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ message: 'Hola' }),
      }),
    );
  });

  test('emits the shared suspension event on a streamed 402 response', async () => {
    const dispatchEvent = jest.spyOn(window, 'dispatchEvent');
    global.fetch.mockResolvedValue({
      status: 402,
      clone: () => ({ json: async () => ({ detail: { code: 'SUBSCRIPTION_ACCESS_SUSPENDED' } }) }),
    });

    await nexusAiAPI.streamMessage('conv-1', { message: 'Hola' });

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'nexus:subscription-suspended' }));
    dispatchEvent.mockRestore();
  });
});
