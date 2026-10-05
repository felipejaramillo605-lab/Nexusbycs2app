import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerLegalDocuments from './OwnerLegalDocuments';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockList = jest.fn();
const mockSave = jest.fn();

jest.mock('../api', () => ({
  legalAPI: {
    ownerGetDocuments: (...args) => mockList(...args),
    ownerSaveDocument: (...args) => mockSave(...args),
    ownerRestoreDocument: jest.fn(),
  },
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  return {
    ActionButton: ({ children, variant: _v, icon: _i, loading: _l, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
    MotionPage: ({ children }) => React.createElement('div', null, children),
    PageHeader: ({ title, actions }) => React.createElement('header', null, React.createElement('h1', null, title), actions),
    StatusBadge: ({ children }) => React.createElement('span', null, children),
    SurfaceCard: ({ children }) => React.createElement('section', null, children),
  };
});

let container;
let root;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'TEXTO BASE' });
  mockList.mockResolvedValue({
    data: {
      version: '2.0',
      titles: { terminos: 'Términos de servicio', 'contrato-transmision': 'Contrato', 'uso-aceptable-ia': 'Uso' },
      documents: { terminos: null, 'contrato-transmision': null, 'uso-aceptable-ia': null },
    },
  });
  mockSave.mockResolvedValue({ data: { version: '2.0' } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

test('loads the base text and saves an edit without publishing a new version by default', async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OwnerLegalDocuments />);
  });
  await act(async () => {});
  const textarea = container.querySelector('textarea');
  expect(textarea.value).toBe('TEXTO BASE');
  const save = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar');
  await act(async () => {
    save.click();
  });
  expect(mockSave).toHaveBeenCalledWith('terminos', { title: 'Términos de servicio', body_md: 'TEXTO BASE', publish_new_version: false });
});
