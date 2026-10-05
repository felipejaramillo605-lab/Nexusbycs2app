import { CONSENT_STORAGE_KEY, getConsent, saveConsent, whenConsented } from './consent';

beforeEach(() => localStorage.clear());

test('defaults optional categories to off', () => {
  expect(getConsent()).toMatchObject({ necessary: true, analytics: false, marketing: false });
});

test('rejection does not run a loader', () => {
  const loader = jest.fn();
  saveConsent({ analytics: false, marketing: false });
  expect(whenConsented('analytics', loader)).toBe(false);
  expect(loader).not.toHaveBeenCalled();
});

test('acceptance runs a loader once and persists a dated choice', () => {
  const loader = jest.fn();
  saveConsent({ analytics: true });
  expect(whenConsented('analytics', loader)).toBe(true);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY))).toMatchObject({ analytics: true, necessary: true });
});

test('a saved choice can be revoked', () => {
  saveConsent({ analytics: true, marketing: true });
  saveConsent({ analytics: false, marketing: false });
  const loader = jest.fn();
  expect(whenConsented('marketing', loader)).toBe(false);
  expect(loader).not.toHaveBeenCalled();
});
