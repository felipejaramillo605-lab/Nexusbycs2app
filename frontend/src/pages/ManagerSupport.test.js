import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ManagerSupport from './ManagerSupport';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockList = jest.fn();
const mockSuggest = jest.fn();
const mockCreate = jest.fn();

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../api', () => ({
  supportAPI: {
    list: (...args) => mockList(...args),
    suggest: (...args) => mockSuggest(...args),
    create: (...args) => mockCreate(...args),
    get: jest.fn(),
    sendMessage: jest.fn(),
  },
}));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, icon: _icon, loading: _loading, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    AccessibleModal: ({ children, open }) => open ? React.createElement('section', null, children) : null,
    DetailDrawer: ({ children }) => React.createElement('aside', null, children),
    EmptyState: ({ action, title }) => React.createElement('section', null, title, action),
    FieldGuide: ({ label }) => React.createElement('span', null, label),
    LoadingState: ({ label }) => React.createElement('p', null, label),
    MotionPage: ({ children }) => React.createElement('main', null, children),
    PageHeader: ({ actions, title }) => React.createElement('header', null, title, actions),
    ResponsiveDataView: ({ empty }) => empty,
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

async function renderPage() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ManagerSupport />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { host, root };
}

function setControlledValue(element, value) {
  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set;
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ManagerSupport', () => {
  let root;

  beforeEach(() => {
    mockList.mockResolvedValue({ data: { items: [] } });
    mockSuggest.mockResolvedValue({ data: { suggestion: { category: 'reclamo', priority: 'high' }, confidence: 0.72, provider: 'heuristic' } });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    root = null;
    jest.clearAllMocks();
  });

  test('applies a basic suggestion after an explicit click without sending the PQRS', async () => {
    const rendered = await renderPage();
    root = rendered.root;
    const open = [...rendered.host.querySelectorAll('button')].find((button) => button.textContent === 'Nuevo PQRS');
    await act(async () => open.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const [subject, message] = rendered.host.querySelectorAll('input, textarea');
    await act(async () => {
      setControlledValue(subject, 'Cobro duplicado');
      setControlledValue(message, 'Veo un cobro duplicado en mi factura');
    });
    const suggest = [...rendered.host.querySelectorAll('button')].find((button) => button.textContent === 'Sugerir tipo y prioridad');
    await act(async () => {
      suggest.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSuggest).toHaveBeenCalledWith({ subject: 'Cobro duplicado', initial_message: 'Veo un cobro duplicado en mi factura' });
    expect(rendered.host.textContent).toContain('Sugerencia automática básica (confianza 72%)');
    expect(rendered.host.querySelector('select').value).toBe('reclamo');
    expect(rendered.host.querySelectorAll('select')[1].value).toBe('high');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
