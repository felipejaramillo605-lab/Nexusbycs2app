import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EmailLabelsCard from './EmailLabelsCard';
import { customEmailLabels, isValidEmailWord } from '../lib/emailLabels';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('EmailLabelsCard', () => {
  let host;
  let root;
  const effective = { service_icon: '🩺', professional_icon: '👤', service_label: 'Servicio', professional_label: 'Profesional' };

  const renderCard = async (props) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<EmailLabelsCard custom={{}} effective={effective} {...props} />); });
  };

  const changeValue = async (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  afterEach(async () => {
    if (root) await act(async () => { root.unmount(); });
    document.body.innerHTML = '';
    root = null;
  });

  test('starts from the default of the business type, not from the scissors', async () => {
    await renderCard();
    const preview = host.querySelector('[data-testid="email-labels-preview"]').textContent;
    expect(preview).toContain('🩺 Servicio');
    expect(preview).not.toContain('✂️');
    expect(host.querySelector('[aria-label="Icono del servicio: 🩺"]').getAttribute('aria-pressed')).toBe('true');
  });

  test('lets the manager pick an icon and a word and sends only what changed', async () => {
    const onSave = jest.fn();
    await renderCard({ onSave });
    await act(async () => { host.querySelector('[aria-label="Icono del servicio: 🧘"]').click(); });
    await changeValue(host.querySelector('[data-testid="email-service-word"]'), 'Sesión');
    expect(host.querySelector('[data-testid="email-labels-preview"]').textContent).toContain('🧘 Sesión');
    await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ service_icon: '🧘', service_label: 'Sesión' });
  });

  test('blocks unsupported characters and can go back to the business type defaults', async () => {
    const onSave = jest.fn();
    await renderCard({ onSave });
    await changeValue(host.querySelector('[data-testid="email-professional-word"]'), '<b>Dr</b>');
    expect(host.querySelector('[data-testid="email-labels-save"]').disabled).toBe(true);
    expect(host.textContent).toContain('Usa solo letras');
    await act(async () => { host.querySelector('[data-testid="email-labels-restore"]').click(); });
    expect(onSave).toHaveBeenCalledWith({});
  });

  test('word helpers mirror the server rules', () => {
    expect(isValidEmailWord('Especialista')).toBe(true);
    expect(isValidEmailWord('')).toBe(true);
    expect(isValidEmailWord('a'.repeat(25))).toBe(false);
    expect(isValidEmailWord('<script>')).toBe(false);
    expect(customEmailLabels({ service_icon: '✨', service_label: '  ', professional_label: ' Terapeuta ' })).toEqual({
      service_icon: '✨',
      professional_label: 'Terapeuta',
    });
  });
});
