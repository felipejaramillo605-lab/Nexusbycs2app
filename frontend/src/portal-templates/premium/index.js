// Premium entries intentionally contain metadata only; visual implementations arrive in later PRs.
export const PREMIUM_TEMPLATE_KEYS = Object.freeze([
  'barberia-real', 'bloom', 'ignition', 'claridad', 'noir', 'atelier', 'recreo',
]);

export const PREMIUM_TEMPLATE_METADATA = Object.freeze(Object.fromEntries(
  PREMIUM_TEMPLATE_KEYS.map((key) => [key, Object.freeze({ key, tier: 'premium' })]),
));
