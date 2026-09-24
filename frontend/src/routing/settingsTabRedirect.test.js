import { settingsTabRedirectLocation } from './settingsTabRedirect';

describe('settingsTabRedirectLocation', () => {
  test('preserves all existing query parameters and sets the selected tab', () => {
    expect(settingsTabRedirectLocation('?org_id=org-42&from=invoice&tab=general', 'billing')).toEqual({
      pathname: '/manager/settings',
      search: '?org_id=org-42&from=invoice&tab=billing',
    });
  });

  test('adds the tab while preserving an empty query string', () => {
    expect(settingsTabRedirectLocation('', 'fiscal')).toEqual({
      pathname: '/manager/settings',
      search: '?tab=fiscal',
    });
  });
});