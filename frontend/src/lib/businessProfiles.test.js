import { BUSINESS_PROFILES, BUSINESS_TYPE_OPTIONS, getBusinessProfile } from './businessProfiles';

describe('business presentation profiles', () => {
  test('includes a pet-grooming profile with pet-safe examples and a portal recommendation', () => {
    const profile = getBusinessProfile('pet_grooming');
    expect(profile.label).toBe('Grooming para mascotas');
    expect(profile.recommendedThemes).toContain('pet-care');
    expect(profile.examples.join(' ')).not.toMatch(/barba/i);
  });

  test('keeps each configured vertical selectable and falls back safely for historic values', () => {
    expect(BUSINESS_TYPE_OPTIONS.map(({ value }) => value)).toEqual(Object.keys(BUSINESS_PROFILES));
    expect(getBusinessProfile('unknown-old-value')).toBe(BUSINESS_PROFILES.barbershop);
  });

  test('does not suggest the barber profile for nail, clinical, movement, or pet businesses', () => {
    ['nail_spa', 'health_clinic', 'pilates_studio', 'pet_grooming'].forEach((businessType) => {
      expect(getBusinessProfile(businessType).recommendedThemes).not.toContain('barberia-real');
      expect(getBusinessProfile(businessType).examples.join(' ')).not.toMatch(/arreglo de barba/i);
    });
  });
});
