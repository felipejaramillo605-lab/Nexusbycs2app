import {
  FEATURES, COUNTRY_PROFILES, featureEnabled, featureForPath, getCountryProfile, normalizeCountry,
} from './countryProfile';

test('an organization without country (created before this change) behaves as Colombia', () => {
  expect(getCountryProfile({}).country).toBe('CO');
  expect(getCountryProfile(null).currency).toBe('COP');
  expect(normalizeCountry('fr')).toBe('CO');
  expect(normalizeCountry('us')).toBe('US');
});

test('US sets dollars, +1, New York time and an English client portal; Colombia keeps pesos and +57', () => {
  const us = getCountryProfile({ operating_country: 'US' });
  expect([us.currency, us.phoneCountry, us.phonePrefix, us.portalLanguage]).toEqual(['USD', 'US', '+1', 'en']);
  expect(us.timezone).toBe('America/New_York');
  expect(us.messagingConsentRequired).toBe(true);
  const co = getCountryProfile({ operating_country: 'CO' });
  expect([co.currency, co.phoneCountry, co.phonePrefix, co.portalLanguage]).toEqual(['COP', 'CO', '+57', 'es']);
});

test('Colombia keeps every feature; US hides marketing campaigns, payroll and HR', () => {
  Object.values(FEATURES).forEach((feature) => {
    expect(featureEnabled({ operating_country: 'CO' }, feature)).toBe(true);
    expect(featureEnabled({}, feature)).toBe(true);
    expect(featureEnabled({ operating_country: 'US' }, feature)).toBe(false);
  });
});

test('routes map to the feature they depend on', () => {
  expect(featureForPath('/manager/payroll')).toBe(FEATURES.PAYROLL);
  expect(featureForPath('/manager/marketing')).toBe(FEATURES.MARKETING);
  expect(featureForPath('/staff/bienestar')).toBe(FEATURES.HR);
  expect(featureForPath('/manager/appointments')).toBeNull();
});

test('the frontend table mirrors the backend one', () => {
  expect(Object.keys(COUNTRY_PROFILES)).toEqual(['CO', 'US']);
  expect(COUNTRY_PROFILES.US.disabledFeatures).toEqual(['marketing_campaigns', 'payroll', 'hr']);
});
