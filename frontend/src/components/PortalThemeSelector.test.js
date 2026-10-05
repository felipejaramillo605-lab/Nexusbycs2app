import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PortalThemeSelector from './PortalThemeSelector';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockUpdate = jest.fn();
jest.mock('../api', () => ({ organizationAPI: { update: (...args) => mockUpdate(...args) } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

let host;
let root;

const render = async (props) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<PortalThemeSelector organizationId="org_1" currentTheme="classic" {...props} />);
  });
};
const click = (element) => act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const themeButtons = () => Array.from(host.querySelectorAll('button')).filter((b) => b.dataset.testid !== 'save-portal-theme');
const save = () => host.querySelector('[data-testid="save-portal-theme"]');

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  document.body.innerHTML = '';
  root = null;
  jest.clearAllMocks();
});

test('picking a theme does not save by itself and "Guardar cambios" is disabled until something changes', async () => {
  await render();
  expect(save().disabled).toBe(true);
  const other = themeButtons().find((b) => !b.className.includes('border-[var(--app-primary)] bg'));
  await click(other);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(save().disabled).toBe(false);
});

test('saving a normal theme also resets portal_template to classic so a premium one stops overriding it', async () => {
  mockUpdate.mockResolvedValue({ data: {} });
  const onThemeChange = jest.fn();
  const onTemplateReset = jest.fn();
  await render({ premiumActive: true, onThemeChange, onTemplateReset });
  expect(host.querySelector('[data-testid="premium-active-notice"]')).not.toBeNull();
  expect(save().disabled).toBe(true); // nada elegido todavia: la premium sigue activa
  const first = themeButtons()[0];
  await click(first);
  expect(save().disabled).toBe(false);
  await click(save());
  expect(mockUpdate).toHaveBeenCalledWith('org_1', { client_portal_theme: expect.any(String), portal_template: 'classic' });
  expect(onThemeChange).toHaveBeenCalledWith(mockUpdate.mock.calls[0][1].client_portal_theme);
  expect(onTemplateReset).toHaveBeenCalledWith('classic');
});

test('a failed save reports the error and keeps the callbacks untouched', async () => {
  mockUpdate.mockRejectedValue({ response: { data: { detail: 'falló' } } });
  const onThemeChange = jest.fn();
  await render({ premiumActive: true, onThemeChange });
  await click(themeButtons()[0]);
  await click(save());
  expect(onThemeChange).not.toHaveBeenCalled();
});
