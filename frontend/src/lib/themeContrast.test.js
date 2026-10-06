import { CLIENT_PORTAL_THEMES } from '../portal-templates';
import {
  MIN_TEXT_CONTRAST, contrastRatio, contrastSafeColors, ensureContrast, readableOn,
} from './themeContrast';

test('contrast ratio matches the WCAG reference values', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
});

test('ensureContrast darkens on light backgrounds and lightens on dark ones', () => {
  const darker = ensureContrast('#D4849A', ['#fdf2f6', '#fbe4ec']);
  expect(contrastRatio(darker, '#fbe4ec')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  const lighter = ensureContrast('#555555', ['#0a0a0a', '#1a1a1a']);
  expect(contrastRatio(lighter, '#1a1a1a')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  expect(ensureContrast('#ffffff', ['#0a0a0a'])).toBe('#ffffff');
});

test('readableOn picks the text color with more contrast', () => {
  expect(readableOn('#0A84FF')).toBe('#111111');
  expect(readableOn('#1e3a8a')).toBe('#ffffff');
});

test.each(Object.keys(CLIENT_PORTAL_THEMES))('standard theme %s keeps text and buttons readable', (key) => {
  const theme = CLIENT_PORTAL_THEMES[key];
  const safe = contrastSafeColors(theme);
  [theme.bgStart, theme.bgEnd].forEach((bg) => {
    expect(contrastRatio(safe.textPrimary, bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(safe.textSecondary, bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(safe.accentPrimary, bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
  expect(contrastRatio(safe.onAccentPrimary, safe.accentPrimary)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  expect(contrastRatio(safe.onAccentSecondary, safe.accentSecondary)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
});

describe('premium templates', () => {
  const { PREMIUM_TEMPLATE_IMPLEMENTATIONS } = require('../portal-templates');
  test.each(Object.keys(PREMIUM_TEMPLATE_IMPLEMENTATIONS))('%s keeps text on cards and buttons readable', (key) => {
    const v = PREMIUM_TEMPLATE_IMPLEMENTATIONS[key].variables;
    const cards = [v['--app-surface-solid'], v['--app-surface-elevated'], v['--app-surface-muted']].filter(Boolean);
    cards.forEach((card) => {
      ['--app-text-primary', '--app-text-secondary', '--app-text-muted'].forEach((name) => {
        expect(contrastRatio(v[name], card)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      });
    });
    expect(contrastRatio(v['--app-on-primary'], v['--app-primary'])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(v['--app-on-primary-hover'], v['--app-primary-hover'])).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
