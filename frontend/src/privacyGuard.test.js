import { readFileSync } from 'fs';
import path from 'path';

// Guardia de privacidad: la app no debe cargar recursos de terceros que envien la IP del visitante
// ni analitica/grabacion de sesiones sin consentimiento (ver docs/legal/10).
const read = (file) => readFileSync(path.join(__dirname, '..', file), 'utf8');

test('index.html no carga analitica, grabacion de sesiones ni fuentes de terceros', () => {
  const html = read('public/index.html');
  expect(html).not.toMatch(/posthog|googletagmanager|google-analytics|fbevents|hotjar|clarity\.ms/i);
  expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  expect(html).toContain('/fonts/fonts.css');
});

test('las hojas de estilo y plantillas usan fuentes propias', () => {
  expect(read('src/index.css')).not.toMatch(/googleapis|gstatic/);
  ['barberia-real', 'bloom', 'ignition', 'noir'].forEach((name) => {
    expect(read(`src/portal-templates/premium/${name}/index.js`)).not.toMatch(/googleapis|gstatic/);
  });
});

test('las fuentes alojadas existen y estan declaradas con font-display swap', () => {
  const css = read('public/fonts/fonts.css');
  const files = [...css.matchAll(/url\(\/fonts\/([^)]+\.woff2)\)/g)].map((m) => m[1]);
  expect(files.length).toBeGreaterThanOrEqual(10);
  files.forEach((file) => expect(() => readFileSync(path.join(__dirname, '..', 'public/fonts', file))).not.toThrow());
  expect(css).toContain('font-display: swap');
});
