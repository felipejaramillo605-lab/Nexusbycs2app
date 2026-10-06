import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PortalHeroImageField from './PortalHeroImageField';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockUpload = jest.fn();
const mockDelete = jest.fn();

jest.mock('../api', () => ({
  organizationAPI: { uploadPortalBackground: (...a) => mockUpload(...a), deletePortalBackground: (...a) => mockDelete(...a) },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

let container;
let root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function mount(organization, onChanged = jest.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<PortalHeroImageField organizationId="org_1" organization={organization} onChanged={onChanged} />); });
  return onChanged;
}

test('states the exact dimensions the manager needs before uploading', async () => {
  await mount({});
  const spec = container.querySelector('[data-testid="image-spec"]').textContent;
  expect(spec).toContain('1920 × 1080 px');
  expect(spec).toContain('16:9');
  expect(spec).toContain('1600 × 900 px');
  expect(container.textContent).toContain('Predeterminada');
  expect(container.textContent).not.toContain('Usar la predeterminada');
});

test('uploading sends the file to the portal background endpoint and reports the new organization fields', async () => {
  mockUpload.mockResolvedValue({ data: { portal_background_type: 'image', portal_background_url: '/media/hero.webp' } });
  const onChanged = await mount({});
  const file = new File(['x'], 'hero.jpg', { type: 'image/jpeg' });
  const input = container.querySelector('[data-testid="hero-image-input"]');
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(mockUpload).toHaveBeenCalledWith('org_1', file);
  expect(onChanged).toHaveBeenCalledWith({ portal_background_type: 'image', portal_background_url: '/media/hero.webp' });
});

test('with an image set, the manager can go back to the template default', async () => {
  mockDelete.mockResolvedValue({ data: { portal_background_type: 'none', portal_background_url: null } });
  const onChanged = await mount({ portal_background_type: 'image', portal_background_url: '/media/hero.webp' });
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Usar la predeterminada'));
  await act(async () => { button.click(); });
  expect(mockDelete).toHaveBeenCalledWith('org_1');
  expect(onChanged).toHaveBeenCalledWith({ portal_background_type: 'none', portal_background_url: null });
});
