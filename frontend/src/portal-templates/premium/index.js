import { BARBERIA_REAL_TEMPLATE } from './barberia-real';

export const PREMIUM_TEMPLATE_KEYS = Object.freeze([
  'barberia-real', 'bloom', 'ignition', 'claridad', 'noir', 'atelier', 'recreo',
]);

export const PREMIUM_TEMPLATE_IMPLEMENTATIONS = Object.freeze({
  'barberia-real': BARBERIA_REAL_TEMPLATE,
});

export const PREMIUM_TEMPLATE_METADATA = Object.freeze(Object.fromEntries(
  PREMIUM_TEMPLATE_KEYS.map((key) => [key, Object.freeze({ key, tier: 'premium' })]),
));
