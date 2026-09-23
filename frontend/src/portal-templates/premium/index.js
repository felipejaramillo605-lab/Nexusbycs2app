import { BARBERIA_REAL_TEMPLATE } from './barberia-real';
import { BLOOM_TEMPLATE } from './bloom';

export const PREMIUM_TEMPLATE_KEYS = Object.freeze([
  'barberia-real', 'bloom', 'ignition', 'claridad', 'noir', 'atelier', 'recreo',
]);

export const PREMIUM_TEMPLATE_IMPLEMENTATIONS = Object.freeze({
  'barberia-real': BARBERIA_REAL_TEMPLATE,
  bloom: BLOOM_TEMPLATE,
});

export const PREMIUM_TEMPLATE_METADATA = Object.freeze(Object.fromEntries(
  PREMIUM_TEMPLATE_KEYS.map((key) => [key, Object.freeze({ key, tier: 'premium' })]),
));
