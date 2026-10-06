import {
  DEFAULT_EXPERIENCES_LABEL, IMAGE_SPECS, experiencesLabel, formatCycle, isLandingActive, landingMenu,
} from './portalLanding';

test('landing is active only when the template supports it and the manager did not turn it off', () => {
  expect(isLandingActive({}, { landing: true })).toBe(true);
  expect(isLandingActive({ portal_landing_enabled: false }, { landing: true })).toBe(false);
  expect(isLandingActive({}, { landing: false })).toBe(false);
  expect(isLandingActive({}, undefined)).toBe(false);
});

test('the experiences label falls back to the default and trims what the manager wrote', () => {
  expect(experiencesLabel({})).toBe(DEFAULT_EXPERIENCES_LABEL);
  expect(experiencesLabel({ portal_experiences_label: '  Disciplinas ' })).toBe('Disciplinas');
  expect(experiencesLabel({ portal_experiences_label: '   ' })).toBe(DEFAULT_EXPERIENCES_LABEL);
});

test('the menu only lists sections that have content, always ending with contact', () => {
  expect(landingMenu({ hasExperiences: true, hasPlans: true, label: 'Clases' }).map((i) => i.id)).toEqual(['experiencias', 'planes', 'contacto']);
  expect(landingMenu({ hasExperiences: false, hasPlans: false, label: 'Clases' }).map((i) => i.id)).toEqual(['contacto']);
});

test('billing cycles read naturally', () => {
  expect(formatCycle(30)).toBe('1 mes');
  expect(formatCycle(60)).toBe('2 meses');
  expect(formatCycle(7)).toBe('1 semana');
  expect(formatCycle(45)).toBe('45 días');
});

test('image specs state the dimensions managers need', () => {
  expect(IMAGE_SPECS.hero.size).toBe('1920 × 1080 px');
  expect(IMAGE_SPECS.experience.ratio).toContain('4:5');
});
