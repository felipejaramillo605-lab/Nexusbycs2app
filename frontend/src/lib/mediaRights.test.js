import { api } from '../api';
import { isMediaRightsError, onMediaRightsRequest, requestMediaRights } from './mediaRights';

const rejection = (config) => ({
  config,
  response: { status: 409, data: { detail: { code: 'media_rights_required', version: '1.0', message: 'Declaro...' } } },
});
const ok = (config) => ({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config });

afterEach(() => {
  delete api.defaults.adapter;
});

test('requestMediaRights resolves false when nobody can ask the user', async () => {
  await expect(requestMediaRights({})).resolves.toBe(false);
});

test('detects only the media rights conflict', () => {
  expect(isMediaRightsError(rejection({}))).toBe(true);
  expect(isMediaRightsError({ response: { status: 409, data: { detail: 'otro' } } })).toBe(false);
  expect(isMediaRightsError({ response: { status: 500 } })).toBe(false);
});

test('the first upload is retried once after the user accepts', async () => {
  let calls = 0;
  api.defaults.adapter = (config) => {
    calls += 1;
    return calls === 1 ? Promise.reject(rejection(config)) : Promise.resolve(ok(config));
  };
  const off = onMediaRightsRequest((detail, resolve) => {
    expect(detail.code).toBe('media_rights_required');
    resolve(true);
  });
  const response = await api.post('/services/s1/photos', new FormData());
  off();
  expect(response.data.ok).toBe(true);
  expect(calls).toBe(2);
});

test('if the user cancels, the original error is returned and nothing is retried', async () => {
  let calls = 0;
  api.defaults.adapter = (config) => {
    calls += 1;
    return Promise.reject(rejection(config));
  };
  const off = onMediaRightsRequest((detail, resolve) => resolve(false));
  await expect(api.post('/organizations/o1/logo', new FormData())).rejects.toBeTruthy();
  off();
  expect(calls).toBe(1);
});

test('a second conflict after accepting does not loop forever', async () => {
  let calls = 0;
  api.defaults.adapter = (config) => {
    calls += 1;
    return Promise.reject(rejection(config));
  };
  const off = onMediaRightsRequest((detail, resolve) => resolve(true));
  await expect(api.post('/barbers/me/avatar', new FormData())).rejects.toBeTruthy();
  off();
  expect(calls).toBe(2);
});
