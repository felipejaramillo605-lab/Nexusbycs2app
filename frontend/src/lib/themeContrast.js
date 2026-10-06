// Contraste legible (WCAG 2.1 AA, 4.5:1) para los colores de las plantillas del portal.
// Las plantillas estandar definen solo fondo, texto y acentos; aqui se calculan las variantes que se ven bien.

export const MIN_TEXT_CONTRAST = 4.5;

const parseHex = (hex) => {
  const value = String(hex || '').replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export const luminance = (hex) => {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
};

export const contrastRatio = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const mix = (hex, target, amount) => {
  const from = parseHex(hex);
  const to = parseHex(target);
  if (!from || !to) return hex;
  return toHex(from.map((c, i) => c + (to[i] - c) * amount));
};

/** Acerca `color` hacia negro (fondos claros) o blanco (fondos oscuros) hasta leerse sobre todos los fondos. */
export const ensureContrast = (color, backgrounds, min = MIN_TEXT_CONTRAST) => {
  const bgs = backgrounds.filter((bg) => parseHex(bg));
  if (!parseHex(color) || !bgs.length) return color;
  const worst = (c) => Math.min(...bgs.map((bg) => contrastRatio(c, bg)));
  if (worst(color) >= min) return color;
  const light = bgs.reduce((sum, bg) => sum + luminance(bg), 0) / bgs.length > 0.4;
  const target = light ? '#000000' : '#ffffff';
  for (let step = 1; step <= 25; step += 1) {
    const candidate = mix(color, target, step * 0.04);
    if (worst(candidate) >= min) return candidate;
  }
  return target;
};

/** Texto (blanco o casi negro) que mejor se lee encima de un fondo de boton. */
export const readableOn = (background) => (
  contrastRatio('#ffffff', background) >= contrastRatio('#111111', background) ? '#ffffff' : '#111111'
);

/** Variantes con contraste suficiente para una plantilla estandar. */
export const contrastSafeColors = (theme) => {
  const backgrounds = [theme.bgStart, theme.bgEnd];
  const accentPrimary = ensureContrast(theme.accentPrimary, backgrounds);
  return {
    textPrimary: ensureContrast(theme.textPrimary, backgrounds),
    textSecondary: ensureContrast(theme.textSecondary, backgrounds),
    accentPrimary,
    accentSecondary: theme.accentSecondary,
    onAccentPrimary: readableOn(accentPrimary),
    onAccentSecondary: readableOn(theme.accentSecondary),
  };
};
