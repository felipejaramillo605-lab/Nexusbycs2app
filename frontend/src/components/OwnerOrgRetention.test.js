import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerOrgRetention from './OwnerOrgRetention';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockPlan = jest.fn();
const mockPurge = jest.fn();

jest.mock('../api', () => ({
  retentionAPI: { organizationsPlan: (...args) => mockPlan(...args), purgeOrganizations: (...args) => mockPurge(...args) },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('./design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, variant: _v, icon: _i, loading: _l, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

let container;
let root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OwnerOrgRetention />);
  });
  await act(async () => {});
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const DUE = { retention_days: 90, organizations: [{ organization_id: 'org_old', name: 'Vieja', deleted_at: '2026-06-01T00:00:00+00:00', media_files: 3, clients: 5 }] };

test('shows the organizations due with the name, media and clients, and keeps the button disabled without the phrase', async () => {
  mockPlan.mockResolvedValue({ data: DUE });
  await mount();
  expect(container.querySelector('[data-testid=org-retention-list]').textContent).toContain('Vieja');
  expect(container.textContent).toContain('3 imagen(es)');
  expect(container.textContent).toContain('5 cliente(s)');
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Purgar'));
  expect(button.disabled).toBe(true);
});

test('runs only after typing the exact phrase and reports completed and pending organizations', async () => {
  mockPlan.mockResolvedValue({ data: DUE });
  mockPurge.mockResolvedValue({ data: { organizations: [{ completed: true }, { completed: false }] } });
  await mount();
  const input = container.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'PURGAR ORGANIZACIONES');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Purgar'));
  expect(button.disabled).toBe(false);
  await act(async () => {
    button.click();
  });
  expect(mockPurge).toHaveBeenCalledWith('PURGAR ORGANIZACIONES');
  expect(container.querySelector('[data-testid=org-retention-result]').textContent).toContain('1 completada(s)');
  expect(container.querySelector('[data-testid=org-retention-result]').textContent).toContain('1 pendiente(s)');
});

test('with nothing pending it says so and cannot be run', async () => {
  mockPlan.mockResolvedValue({ data: { retention_days: 90, organizations: [] } });
  await mount();
  expect(container.querySelector('[data-testid=org-retention-empty]')).not.toBeNull();
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Purgar'));
  expect(button.disabled).toBe(true);
});
