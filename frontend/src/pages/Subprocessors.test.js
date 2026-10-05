import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'fs';
import path from 'path';
import Subprocessors, { SUBPROCESSORS } from './Subprocessors';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });

let container;
let root;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Subprocessors />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const read = (file) => readFileSync(path.join(__dirname, '..', '..', '..', file), 'utf8');

test('lists every sub-processor from the retention and sub-processor policy with its country', () => {
  const text = container.textContent;
  ['Emergent', 'MongoDB', 'Cloudflare', 'Resend', 'Google', 'IONOS', 'Meta', 'Wompi', 'TypeSafe (Jev)'].forEach((name) => {
    expect(text).toContain(name);
  });
  expect(container.querySelectorAll('tbody tr')).toHaveLength(SUBPROCESSORS.length);
  SUBPROCESSORS.forEach((item) => expect(item.country).toBeTruthy());
});

test('Jev is shown as not active and unconfirmed regions are not invented', () => {
  const jev = SUBPROCESSORS.find((item) => item.name.includes('Jev'));
  expect(jev.region).toBe('No activo');
  expect(SUBPROCESSORS.filter((item) => /por confirmar/i.test(item.region)).length).toBeGreaterThanOrEqual(3);
});

test('it states there is no third-party analytics and never lists PostHog', () => {
  expect(container.textContent).toContain('no usa analitica');
  expect(JSON.stringify(SUBPROCESSORS)).not.toMatch(/posthog/i);
});

test('the privacy policy, the terms and the router link to the page', () => {
  expect(read('frontend/src/pages/PrivacyPolicy.js')).toContain('/subencargados');
  expect(read('frontend/src/pages/TermsOfService.js')).toContain('/subencargados');
  expect(read('frontend/src/App.js')).toContain('path="/subencargados"');
});
