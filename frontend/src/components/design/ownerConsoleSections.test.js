import { ownerMobilePrimary } from './ownerConsoleSections';

describe('ownerMobilePrimary', () => {
  test('opens the operational IT health destination instead of platform branding', () => {
    const it = ownerMobilePrimary.find(([, label]) => label === 'IT');

    expect(it[0]).toBe('/owner/security-events');
    expect(ownerMobilePrimary.some(([path, label]) => label === 'IT' && path === '/owner/platform-branding')).toBe(false);
  });
});
