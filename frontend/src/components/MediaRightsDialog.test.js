import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MediaRightsDialog from './MediaRightsDialog';
import { requestMediaRights } from '../lib/mediaRights';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockAccept = jest.fn();

jest.mock('../api', () => ({ mediaRightsAPI: { accept: (...args) => mockAccept(...args) } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./design/AccessibleModal', () => ({
  AccessibleModal: ({ open, children }) => (open ? <div role="dialog">{children}</div> : null),
}));
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

const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes(text));

test('shows the declaration, keeps accept disabled until the box is checked, then resolves true', async () => {
  let pending;
  await act(async () => {
    pending = requestMediaRights({ version: '1.0', message: 'Declaro que tengo derecho a usar las imágenes' });
  });
  expect(container.textContent).toContain('Declaro que tengo derecho a usar las imágenes');
  expect(buttonByText('Aceptar').disabled).toBe(true);
  mockAccept.mockResolvedValue({});
  await act(async () => {
    container.querySelector('input[type=checkbox]').click();
  });
  await act(async () => {
    buttonByText('Aceptar').click();
  });
  await expect(pending).resolves.toBe(true);
  expect(mockAccept).toHaveBeenCalledWith('1.0');
  expect(container.querySelector('[role=dialog]')).toBeNull();
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
