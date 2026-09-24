import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PremiumTemplateSelector from './PremiumTemplateSelector';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockUpdate = jest.fn();
jest.mock('../api', () => ({
  organizationAPI: {
    update: (...args) => mockUpdate(...args),
  },
}));

describe('PremiumTemplateSelector', () => {
  let host;
  let root;

  const renderSelector = async (props) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<PremiumTemplateSelector organizationId="org_1" currentTemplate="classic" contracted={false} {...props} />);
    });
  };

  afterEach(async () => {
    if (root) await act(async () => { root.unmount(); });
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('lists the three built premium templates plus the four upcoming placeholders', async () => {
    await renderSelector();
    expect(host.textContent).toContain('Barbería Real');
    expect(host.textContent).toContain('Bloom');
    expect(host.textContent).toContain('Ignition');
    expect(host.textContent).toContain('Claridad');
    expect(host.textContent).toContain('Noir');
    expect(host.textContent).toContain('Atelier');
    expect(host.textContent).toContain('Recreo');
    expect(host.querySelectorAll('button:disabled').length).toBeGreaterThanOrEqual(3);
  });

  test('shows the Premium lock banner and never calls the API when not contracted', async () => {
    const onRequestPremium = jest.fn();
    await renderSelector({ onRequestPremium });
    expect(host.textContent).toContain('requieren el plan Premium');
    const buttons = Array.from(host.querySelectorAll('button')).filter((b) => b.textContent.includes('Usar esta plantilla'));
    await act(async () => { buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockUpdate).not.toHaveBeenCalled();
    const requestButton = Array.from(host.querySelectorAll('button')).find((b) => b.textContent.includes('Solicitar Premium'));
    await act(async () => { requestButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onRequestPremium).toHaveBeenCalledTimes(1);
  });

  test('activates a template and persists it via organizationAPI.update when contracted', async () => {
    mockUpdate.mockResolvedValue({ data: { portal_template: 'bloom' } });
    const onTemplateChange = jest.fn();
    await renderSelector({ contracted: true, currentTemplate: 'classic', onTemplateChange });
    expect(host.textContent).not.toContain('requieren el plan Premium');
    const bloomButton = Array.from(host.querySelectorAll('button')).find((b) => b.textContent.includes('Usar esta plantilla'));
    await act(async () => { bloomButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockUpdate).toHaveBeenCalledWith('org_1', { portal_template: 'barberia-real' });
    expect(onTemplateChange).toHaveBeenCalledWith('barberia-real');
  });

  test('reverts the selection when the update request fails', async () => {
    mockUpdate.mockRejectedValue({ response: { data: { detail: 'nope' } } });
    await renderSelector({ contracted: true, currentTemplate: 'classic' });
    const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent.includes('Usar esta plantilla'));
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockUpdate).toHaveBeenCalled();
    expect(host.textContent).not.toContain('Activa');
  });
});
