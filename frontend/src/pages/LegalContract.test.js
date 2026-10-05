import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import LegalContract, { fillPlaceholders } from './LegalContract';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn();
const mockAccept = jest.fn();
const mockDocuments = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../api', () => ({
  legalAPI: {
    getResponsible: (...args) => mockGet(...args),
    accept: (...args) => mockAccept(...args),
    getDocuments: (...args) => mockDocuments(...args),
  },
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager' } }) }));
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: { from: '/dashboard' } }),
}), { virtual: true });
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('react-markdown', () => {
  const React = jest.requireActual('react');
  return { __esModule: true, default: ({ children }) => React.createElement('div', null, children) };
});
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

const PUBLIC = { full_name: 'Felipe Jaramillo Parra', municipality: 'La Estrella, Antioquia', email: 'a@b.co', phone: '+57 323 907 0485' };
const SECRET = { document_type: 'CC', document_number: '9876543210', full_address: 'Calle Secreta 1' };

let container;
let root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<LegalContract />);
  });
  await act(async () => {});
}

beforeEach(() => {
  mockDocuments.mockResolvedValue({ data: { documents: {} } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'CC {{CC_RESPONSABLE}} · {{DIRECCION_COMPLETA}}' });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

test('hides the identity document and address until the contract is accepted', async () => {
  mockGet.mockResolvedValue({ data: { version: '2.0', accepted: false, public: PUBLIC, private: null } });
  await mount();
  const text = container.textContent;
  expect(text).toContain('+57 323 907 0485');
  expect(text).toContain('visibles tras aceptar');
  expect(text).not.toContain('9876543210');
  expect(text).not.toContain('Calle Secreta 1');
  expect(container.querySelector('input[type=checkbox]')).not.toBeNull();
});

test('shows the private data and no acceptance form once accepted', async () => {
  mockGet.mockResolvedValue({ data: { version: '2.0', accepted: true, public: PUBLIC, private: SECRET } });
  await mount();
  const text = container.textContent;
  expect(text).toContain('9876543210');
  expect(text).toContain('Calle Secreta 1');
  expect(container.querySelector('input[type=checkbox]')).toBeNull();
});

test('the accept button stays disabled until the box is checked, then posts the version', async () => {
  mockGet.mockResolvedValue({ data: { version: '2.0', accepted: false, public: PUBLIC, private: null } });
  mockAccept.mockResolvedValue({ data: {} });
  await mount();
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Aceptar'));
  expect(button.disabled).toBe(true);
  await act(async () => {
    container.querySelector('input[type=checkbox]').click();
  });
  expect(button.disabled).toBe(false);
  await act(async () => {
    button.click();
  });
  expect(mockAccept).toHaveBeenCalledWith('2.0', null);
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
});

test('a document edited by the Owner replaces the base text', async () => {
  mockGet.mockResolvedValue({ data: { version: '2.0', accepted: true, public: PUBLIC, private: null } });
  mockDocuments.mockResolvedValue({ data: { documents: { terminos: { title: 'T', body_md: 'TEXTO DEL ABOGADO' } } } });
  await mount();
  expect(container.textContent).toContain('TEXTO DEL ABOGADO');
});

test('placeholders are replaced only when private data exists', () => {
  expect(fillPlaceholders('{{CC_RESPONSABLE}}|{{DIRECCION_COMPLETA}}', null)).toBe('(visible tras aceptar)|(visible tras aceptar)');
  expect(fillPlaceholders('{{CC_RESPONSABLE}}|{{DIRECCION_COMPLETA}}', SECRET)).toBe('9876543210|Calle Secreta 1');
});

test('the identification data is the last block of the page, in small print', async () => {
  mockGet.mockResolvedValue({ data: { version: '2.0', accepted: true, public: PUBLIC, private: SECRET } });
  await mount();
  const block = container.querySelector('[data-testid="legal-identification"]');
  expect(block.textContent).toContain('9876543210');
  expect(block.nextElementSibling).toBeNull();
  expect(block.className).toContain('text-[11px]');
});
