import { getHomeForRole } from './roleNavigation';

test('each role lands on the screen it works from', () => {
  expect(getHomeForRole('owner')).toBe('/owner');
  expect(getHomeForRole('manager')).toBe('/manager/dashboard');
  expect(getHomeForRole('staff')).toBe('/staff/appointments');
});
