import {
  CLIENT_PORTAL_THEMES,
  PORTAL_TEMPLATE_KEYS,
  PORTAL_TEMPLATE_METADATA,
  PREMIUM_TEMPLATE_KEYS,
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
