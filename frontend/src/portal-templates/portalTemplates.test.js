import {
  CLIENT_PORTAL_THEMES,
  PORTAL_TEMPLATE_KEYS,
  PORTAL_TEMPLATE_METADATA,
  PREMIUM_TEMPLATE_KEYS,
  PREMIUM_TEMPLATE_IMPLEMENTATIONS,
  resolvePremiumPortalTemplate,
  STANDARD_TEMPLATE_KEYS,
} from './index';

test('template registries retain the seven standard keys and add seven premium metadata entries', () => {
  expect(STANDARD_TEMPLATE_KEYS).toEqual([
    'classic', 'feminine', 'professional', 'cyberpunk', 'underground', 'neutral', 'minimalist_purple',
  ]);
  expect(PREMIUM_TEMPLATE_KEYS).toEqual([
    'barberia-real', 'bloom', 'ignition', 'claridad', 'noir', 'atelier', 'recreo',
  ]);
  expect(PORTAL_TEMPLATE_KEYS).toHaveLength(14);
  expect(PORTAL_TEMPLATE_METADATA.noir).toEqual({ key: 'noir', tier: 'premium' });
  expect(PORTAL_TEMPLATE_METADATA.neutral).toEqual({ key: 'neutral', tier: 'standard' });
});

test('standard theme tokens and legacy lookup behavior remain available', () => {
  expect(Object.keys(CLIENT_PORTAL_THEMES)).toEqual(STANDARD_TEMPLATE_KEYS);
  expect(CLIENT_PORTAL_THEMES.classic.bgStart).toBe('#0a0a0a');
  expect(CLIENT_PORTAL_THEMES.neutral.name).toBe('Verde Natural');
});

test('Barbería Real has an original premium theme contract', () => {
  const template = PREMIUM_TEMPLATE_IMPLEMENTATIONS['barberia-real'];
  expect(template).toMatchObject({ key: 'barberia-real', tier: 'premium', fontFamily: 'Bitter' });
  expect(template.theme.bgStart).toBe('#0F1B2B');
  expect(template.theme.surface).toBe('#F3E9D2');
  expect(template.theme.accentPrimary).toBe('#C9A24B');
  expect(template.theme.accentSecondary).toBe('#6B4A34');
  expect(template.fontHref).toContain('family=Bitter');
});

test('Bloom has an original premium theme contract', () => {
  const template = PREMIUM_TEMPLATE_IMPLEMENTATIONS.bloom;
  expect(template).toMatchObject({ key: 'bloom', tier: 'premium', fontFamily: 'Fraunces' });
  expect(template.theme.bgStart).toBe('#FBE4EC');
  expect(template.theme.accentPrimary).toBe('#7FB3A3');
  expect(template.theme.accentSecondary).toBe('#C97B92');
  expect(template.fontHref).toContain('family=Fraunces');
});

test('Ignition has an original premium theme contract', () => {
  const template = PREMIUM_TEMPLATE_IMPLEMENTATIONS.ignition;
  expect(template).toMatchObject({ key: 'ignition', tier: 'premium', fontFamily: 'Anton' });
  expect(template.theme.bgStart).toBe('#0B0B0C');
  expect(template.theme.accentPrimary).toBe('#C6F135');
  expect(template.theme.accentSecondary).toBe('#FF5A1F');
  expect(template.fontHref).toContain('family=Anton');
});

test('Noir has an original premium theme contract', () => {
  const template = PREMIUM_TEMPLATE_IMPLEMENTATIONS.noir;
  expect(template).toMatchObject({ key: 'noir', tier: 'premium', fontFamily: 'Playfair Display' });
  expect(template.theme.bgStart).toBe('#2A0A3D');
  expect(template.theme.accentPrimary).toBe('#D4AF37');
  expect(template.theme.accentSecondary).toBe('#E0218A');
  expect(template.fontHref).toContain('family=Playfair+Display');
});

test('only the matching organization effective premium key resolves to a visual implementation', () => {
  const organization = {
    organization_id: 'org-1',
    portal_template: 'barberia-real',
    client_portal_theme: 'neutral',
  };
  expect(resolvePremiumPortalTemplate(organization, 'org-1').key).toBe('barberia-real');
  expect(resolvePremiumPortalTemplate(organization, 'org-2')).toBeNull();
  expect(resolvePremiumPortalTemplate({ ...organization, portal_template: 'neutral' }, 'org-1')).toBeNull();
  expect(resolvePremiumPortalTemplate({ ...organization, portal_template: 'unknown' }, 'org-1')).toBeNull();
  expect(resolvePremiumPortalTemplate({ ...organization, portal_template: 'bloom' }, 'org-1').key).toBe('bloom');
  expect(resolvePremiumPortalTemplate({ ...organization, portal_template: 'bloom' }, 'org-2')).toBeNull();
});
