import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BillingProfileCard from './BillingProfileCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetProfile = jest.fn();
const mockSaveProfile = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../api', () => ({
  billingAPI: {
    getProfile: (...args) => mockGetProfile(...args),
    saveProfile: (...args) => mockSaveProfile(...args),
  },
}));
jest.mock('../design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    ActionButton: ({ children, icon: _icon, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    FieldGuide: ({ label }) => React.createElement('span', null, label),
    SurfaceCard: Box,
  };
});

describe('BillingProfileCard', () => {
  let host;
  let root;

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('loads the profile for the organization, joining cc_emails for display, and saves them split back apart', async () => {
    mockGetProfile.mockResolvedValue({
      data: { billing_email: 'facturas@empresa.com', billing_contact_name: 'Ana', cc_emails: ['a@x.com', 'b@x.com'] },
    });
    mockSaveProfile.mockResolvedValue({ data: {} });

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<BillingProfileCard organizationId="org-1" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetProfile).toHaveBeenCalledWith({ organization_id: 'org-1' });
    const ccInput = host.querySelector('input[value="a@x.com, b@x.com"]');
    expect(ccInput).toBeTruthy();

    const submit = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Guardar perfil'));
    await act(async () => {
      submit.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ billing_email: 'facturas@empresa.com', cc_emails: ['a@x.com', 'b@x.com'] }),
      { organization_id: 'org-1' }
    );
  });

  test('re-fetches when the organization changes', async () => {
    mockGetProfile.mockResolvedValue({ data: { billing_email: '', cc_emails: [] } });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<BillingProfileCard organizationId="org-1" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      root.render(<BillingProfileCard organizationId="org-2" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetProfile).toHaveBeenCalledTimes(2);
    expect(mockGetProfile).toHaveBeenLastCalledWith({ organization_id: 'org-2' });
  });
});
