import { BARBERIA_REAL_TEMPLATE } from './barberia-real';
import { BLOOM_TEMPLATE } from './bloom';
import { IGNITION_TEMPLATE } from './ignition';
import { NOIR_TEMPLATE } from './noir';
import { OBSIDIANA_TEMPLATE } from './obsidiana';
import { PORCELANA_TEMPLATE } from './porcelana';
import { VOLTAJE_TEMPLATE } from './voltaje';

export const PREMIUM_TEMPLATE_KEYS = Object.freeze([
  'barberia-real', 'bloom', 'ignition', 'claridad', 'noir', 'atelier', 'recreo',
  'obsidiana', 'porcelana', 'voltaje',
]);

export const PREMIUM_TEMPLATE_IMPLEMENTATIONS = Object.freeze({
  'barberia-real': BARBERIA_REAL_TEMPLATE,
  bloom: BLOOM_TEMPLATE,
  ignition: IGNITION_TEMPLATE,
  noir: NOIR_TEMPLATE,
  obsidiana: OBSIDIANA_TEMPLATE,
  porcelana: PORCELANA_TEMPLATE,
  voltaje: VOLTAJE_TEMPLATE,
});

export const PREMIUM_TEMPLATE_METADATA = Object.freeze(Object.fromEntries(
  PREMIUM_TEMPLATE_KEYS.map((key) => [key, Object.freeze({ key, tier: 'premium' })]),
));
