import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MediaRightsDialog from './MediaRightsDialog';
import { requestMediaRights } from '../lib/mediaRights';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockAccept = jest.fn();

jest.mock('../api', () => ({ mediaRightsAPI: { accept: (...args) => mockAccept(...args) } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, variant: _v, loading: _l, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
  };
});

let container;
let root;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MediaRightsDialog />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const layer = () => document.querySelector('[data-testid="media-rights-layer"]');
const buttonByText = (text) => Array.from(document.querySelectorAll('.nexus-media-rights-panel button')).find((b) => b.textContent.includes(text));

test('shows the declaration, keeps accept disabled until the box is checked, then resolves true', async () => {
  let pending;
  await act(async () => {
    pending = requestMediaRights({ version: '1.0', message: 'Declaro que tengo derecho a usar las imágenes' });
  });
  expect(document.body.textContent).toContain('Declaro que tengo derecho a usar las imágenes');
  expect(buttonByText('Aceptar').disabled).toBe(true);
  mockAccept.mockResolvedValue({});
  await act(async () => {
    document.querySelector('.nexus-media-rights-panel input[type=checkbox]').click();
  });
  await act(async () => {
    buttonByText('Aceptar').click();
  });
  await expect(pending).resolves.toBe(true);
  expect(mockAccept).toHaveBeenCalledWith('1.0');
  expect(layer()).toBeNull();
});

test('cancel resolves false without registering anything', async () => {
  let pending;
  await act(async () => {
    pending = requestMediaRights({ version: '1.0', message: 'x' });
  });
  await act(async () => {
    buttonByText('Cancelar').click();
  });
  await expect(pending).resolves.toBe(false);
  expect(mockAccept).not.toHaveBeenCalled();
});

test('it is its own top layer in the body and shields the modal underneath from taps (mobile: Radix dialogs block outside touches and close on outside press)', async () => {
  await act(async () => {
    requestMediaRights({ version: '1.0', message: 'x' });
  });
  expect(layer().parentElement).toBe(document.body);
  expect(layer().className).toContain('nexus-media-rights-layer');
  const outsideListener = jest.fn();
  document.addEventListener('mousedown', outsideListener);
  document.addEventListener('click', outsideListener);
  await act(async () => {
    const checkbox = document.querySelector('.nexus-media-rights-panel input[type=checkbox]');
    checkbox.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    checkbox.click();
  });
  document.removeEventListener('mousedown', outsideListener);
  document.removeEventListener('click', outsideListener);
  expect(outsideListener).not.toHaveBeenCalled();
  expect(document.querySelector('.nexus-media-rights-panel input[type=checkbox]').checked).toBe(true);
});

test('the styles give the layer pointer events, the highest stacking and a large tap target', () => {
  const { readFileSync } = require('fs');
  const path = require('path');
  const css = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
  const rule = css.slice(css.indexOf('.nexus-media-rights-layer{'));
  expect(rule).toContain('pointer-events:auto');
  expect(rule).toContain('z-index:2147483000');
  expect(css).toMatch(/\.nexus-media-rights-check input\{[^}]*width:24px/);
});
