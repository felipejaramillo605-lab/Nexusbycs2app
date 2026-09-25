import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Home, ShieldCheck } from 'lucide-react';
import { CommandPalette } from './CommandPalette';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./AccessibleModal', () => ({
  AccessibleModal: ({ children, labelledBy, role = 'dialog' }) => {
    const React = jest.requireActual('react');
    return React.createElement('div', { role, 'aria-labelledby': labelledBy }, children);
  },
}));

const items = [
  { path: '/owner', label: 'Inicio', Icon: Home, section: 'Inicio' },
  { path: '/owner/access', label: 'Control de accesos', Icon: ShieldCheck, section: 'Control de accesos' },
];

async function renderComponent(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<CommandPalette open items={items} onClose={jest.fn()} {...props} />);
  });
  return { host, root };
}

async function cleanup(root) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
}

const type = async (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const keydown = async (element, key) => act(async () => {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
});

describe('CommandPalette', () => {
  let root;
  afterEach(() => cleanup(root));

  test('renders nothing when closed', async () => {
    const rendered = await renderComponent({ open: false });
    root = rendered.root;
    expect(rendered.host.textContent).toBe('');
  });

  test('filters items by label or section as the user types', async () => {
    const rendered = await renderComponent();
    root = rendered.root;
    const input = rendered.host.querySelector('input');
    await type(input, 'acceso');
    expect(rendered.host.textContent).toContain('Control de accesos');
    expect(rendered.host.textContent).not.toContain('Inicio');
  });

  test('shows an empty-results message for a query that matches nothing real', async () => {
    const rendered = await renderComponent();
    root = rendered.root;
    await type(rendered.host.querySelector('input'), 'zzz-no-match');
    expect(rendered.host.textContent).toContain('Sin resultados');
  });

  test('ArrowDown then Enter selects the second item, not the first', async () => {
    const onSelect = jest.fn();
    const rendered = await renderComponent({ onSelect });
    root = rendered.root;
    const input = rendered.host.querySelector('input');
    await keydown(input, 'ArrowDown');
    await keydown(input, 'Enter');
    expect(onSelect).toHaveBeenCalledWith('/owner/access');
  });

  test('clicking an item selects it directly', async () => {
    const onSelect = jest.fn();
    const rendered = await renderComponent({ onSelect });
    root = rendered.root;
    const button = [...rendered.host.querySelectorAll('button')].find((b) => b.textContent.includes('Control de accesos'));
    await act(async () => button.click());
    expect(onSelect).toHaveBeenCalledWith('/owner/access');
  });
});
