import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StaffWellbeing from './StaffWellbeing';
import ManagerWellbeing from './ManagerWellbeing';

global.IS_REACT_ACT_ENVIRONMENT = true;

const api = {};
const names = [
  'myWallet', 'redeem', 'myReferrals', 'submitReferral', 'submitReport', 'reportStatus', 'myBeneficiaries', 'addBeneficiary', 'removeBeneficiary',
  'benefits', 'createBenefit', 'updateBenefit', 'archiveBenefit', 'grantPoints', 'decideRedemption', 'vacancies', 'createVacancy', 'toggleVacancy',
  'referrals', 'moveReferral', 'ethicsInbox', 'respondEthics', 'escalateEthics', 'beneficiaries',
];
names.forEach((name) => { api[name] = jest.fn(); });
const mockUpload = jest.fn();

jest.mock('../api', () => ({
  wellbeingAPI: new Proxy({}, { get: (_, name) => (...args) => api[name](...args) }),
  hrAPI: { uploadDocument: (...a) => mockUpload(...a) },
}));
jest.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'manager', organization_id: 'org_a' } }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../components/design', () => {
  const React = jest.requireActual('react');
  const box = (tag) => ({ children }) => React.createElement(tag, null, children);
  return {
    EmptyState: ({ title }) => React.createElement('div', null, title),
    LoadingState: () => React.createElement('div', null, 'Cargando'),
    MotionPage: box('div'),
    PageHeader: ({ title }) => React.createElement('h1', null, title),
    SegmentedControl: ({ options, onChange }) => React.createElement('nav', null, options.map((o) => React.createElement('button', { key: o.value, type: 'button', 'data-tab': o.value, onClick: () => onChange(o.value) }, o.label))),
    SurfaceCard: box('section'),
  };
});

const SCOPE = { organization_id: 'org_a' };
let container;
let root;

beforeEach(() => {
  api.myWallet.mockResolvedValue({ data: { balance: 150, catalog: [{ benefit_id: 'b1', name: 'Bono Sodexo', description: 'Bono de $50.000', points_cost: 100 }, { benefit_id: 'b2', name: 'Medicina prepagada', points_cost: 900 }], redemptions: [{ redemption_id: 'r1', benefit_name: 'Curso', points_cost: 50, status: 'approved' }] } });
  api.redeem.mockResolvedValue({ data: {} });
  api.myReferrals.mockResolvedValue({ data: { vacancies: [{ vacancy_id: 'v1', title: 'Barbero senior', reward_type: 'amount', reward_value: 500000 }], items: [{ referral_id: 'f1', candidate_name: 'Camila', vacancy_title: 'Barbero senior', stage_label: 'En entrevista' }] } });
  api.submitReferral.mockResolvedValue({ data: {} });
  api.submitReport.mockResolvedValue({ data: { tracking_code: 'ABCDE12345', anonymous: true, note: 'Guarda este código.' } });
  api.reportStatus.mockResolvedValue({ data: { category_label: 'Acoso laboral', status_label: 'En revisión', replies: [{ at: '1', message: 'Lo estamos revisando' }] } });
  api.myBeneficiaries.mockResolvedValue({ data: { items: [{ beneficiary_id: 'n1', full_name: 'Sofía Pérez', relationship_label: 'Hijo(a)', document_type: 'RC', document_number: '1099' }] } });
  api.addBeneficiary.mockResolvedValue({ data: {} });
  api.benefits.mockResolvedValue({ data: { catalog: [{ benefit_id: 'b1', name: 'Bono Sodexo', points_cost: 100, active: true }], redemptions: [{ redemption_id: 'r9', employee_name: 'Ana', benefit_name: 'Bono Sodexo', points_cost: 100, status: 'pending' }], balances: [{ barber_id: 'b1', name: 'Ana', balance: 250 }] } });
  api.createBenefit.mockResolvedValue({ data: {} });
  api.grantPoints.mockResolvedValue({ data: {} });
  api.decideRedemption.mockResolvedValue({ data: {} });
  api.vacancies.mockResolvedValue({ data: { items: [{ vacancy_id: 'v1', title: 'Barbero senior', open: true }] } });
  api.createVacancy.mockResolvedValue({ data: {} });
  api.referrals.mockResolvedValue({ data: { items: [{ referral_id: 'f1', candidate_name: 'Camila', candidate_contact: '300', vacancy_title: 'Barbero senior', referrer_name: 'Ana', stage: 'received', stage_label: 'Recibida' }] } });
  api.moveReferral.mockResolvedValue({ data: {} });
  api.ethicsInbox.mockResolvedValue({ data: { items: [{ report_id: 'e1', category_label: 'Acoso laboral', status_label: 'Recibida', anonymous: true, reporter_name: null, created_at: '2026-10-06', message: 'Me gritan frente al equipo.', replies: [], escalations: [] }] } });
  api.respondEthics.mockResolvedValue({ data: {} });
  api.escalateEthics.mockResolvedValue({ data: {} });
  api.beneficiaries.mockResolvedValue({ data: { items: [{ beneficiary_id: 'n1', employee_name: 'Ana', full_name: 'Sofía Pérez', relationship_label: 'Hijo(a)', document_type: 'RC', document_number: '1099', document_id: 'd1' }] } });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function mount(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {});
}
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const click = async (el) => {
  await act(async () => {
    el.click();
  });
};
const tab = (name) => container.querySelector(`[data-tab="${name}"]`);

test('employee wallet shows points, disables unaffordable benefits and redeems', async () => {
  await mount(<StaffWellbeing />);
  expect(container.querySelector('[data-testid="wallet-balance"]').textContent).toContain('150');
  const buttons = container.querySelectorAll('[data-testid="redeem-benefit"]');
  expect(buttons[0].disabled).toBe(false);
  expect(buttons[1].disabled).toBe(true);
  await click(buttons[0]);
  expect(api.redeem).toHaveBeenCalledWith('b1');
  expect(container.textContent).toContain('Curso · 50 puntos · Aprobado');
});

test('employee refers someone and tracks the stage', async () => {
  await mount(<StaffWellbeing />);
  await click(tab('referrals'));
  expect(container.querySelector('[data-testid="referral-row"]').textContent).toContain('En entrevista');
  await setValue(container.querySelector('[data-testid="referral-vacancy"]'), 'v1');
  await setValue(container.querySelector('[data-testid="referral-name"]'), 'Pedro Gómez');
  await setValue(container.querySelector('[data-testid="referral-contact"]'), '3001112233');
  await click(container.querySelector('[data-testid="referral-submit"]'));
  expect(api.submitReferral).toHaveBeenCalledWith({ vacancy_id: 'v1', candidate_name: 'Pedro Gómez', candidate_contact: '3001112233', note: null, document_id: null });
});

test('ethics line: anonymous by default, shows the tracking code once and lets the person check the answer', async () => {
  await mount(<StaffWellbeing />);
  await click(tab('ethics'));
  expect(container.querySelector('[data-testid="ethics-anonymous"]').checked).toBe(true);
  expect(container.querySelector('[data-testid="ethics-submit"]').disabled).toBe(true);
  await setValue(container.querySelector('[data-testid="ethics-message"]'), 'Mi jefe me grita frente al equipo.');
  await click(container.querySelector('[data-testid="ethics-submit"]'));
  expect(api.submitReport).toHaveBeenCalledWith({ category: 'workplace_climate', message: 'Mi jefe me grita frente al equipo.', anonymous: true });
  expect(container.querySelector('[data-testid="ethics-code"]').textContent).toContain('ABCDE12345');
  await setValue(container.querySelector('[data-testid="ethics-lookup-code"]'), 'ABCDE12345');
  await click(container.querySelector('[data-testid="ethics-lookup"]'));
  expect(container.querySelector('[data-testid="ethics-status"]').textContent).toContain('Lo estamos revisando');
});

test('employee registers a beneficiary with the document uploaded first', async () => {
  mockUpload.mockResolvedValue({ data: { document_id: 'doc1' } });
  await mount(<StaffWellbeing />);
  await click(tab('beneficiaries'));
  expect(container.querySelector('[data-testid="beneficiary-row"]').textContent).toContain('Sofía Pérez');
  await setValue(container.querySelector('[data-testid="beneficiary-name"]'), 'Mateo Pérez');
  await setValue(container.querySelector('[data-testid="beneficiary-number"]'), '10998877');
  await click(container.querySelector('[data-testid="beneficiary-add"]'));
  expect(api.addBeneficiary).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Mateo Pérez', relationship: 'child', document_number: '10998877', document_id: null }));
});

test('manager creates a benefit, approves a redemption and grants points', async () => {
  await mount(<ManagerWellbeing />);
  await click(container.querySelector('[data-testid="approve-redemption"]'));
  expect(api.decideRedemption).toHaveBeenCalledWith('r9', { approve: true }, SCOPE);
  await setValue(container.querySelector('[data-testid="benefit-name"]'), 'Auxilio de educación');
  await setValue(container.querySelector('[data-testid="benefit-cost"]'), '300');
  await click(container.querySelector('[data-testid="benefit-create"]'));
  expect(api.createBenefit).toHaveBeenCalledWith({ organization_id: 'org_a', name: 'Auxilio de educación', description: null, points_cost: 300 });
  await setValue(container.querySelector('[data-testid="grant-person"]'), 'b1');
  await setValue(container.querySelector('[data-testid="grant-points"]'), '50');
  await setValue(container.querySelector('[data-testid="grant-reason"]'), 'Meta cumplida');
  await click(container.querySelector('[data-testid="grant-submit"]'));
  expect(api.grantPoints).toHaveBeenCalledWith({ organization_id: 'org_a', barber_id: 'b1', points: 50, reason: 'Meta cumplida' });
});

test('manager opens a vacancy with a reward and moves a referral through the pipeline', async () => {
  await mount(<ManagerWellbeing />);
  await click(tab('referrals'));
  await setValue(container.querySelector('[data-testid="vacancy-title"]'), 'Cajero');
  await setValue(container.querySelector('[data-testid="vacancy-reward-value"]'), '300000');
  await click(container.querySelector('[data-testid="vacancy-create"]'));
  expect(api.createVacancy).toHaveBeenCalledWith({ organization_id: 'org_a', title: 'Cajero', reward_type: 'amount', reward_value: 300000, reward_text: null });
  await setValue(container.querySelector('[data-testid="referral-stage"]'), 'hired');
  expect(api.moveReferral).toHaveBeenCalledWith('f1', { stage: 'hired' }, SCOPE);
});

test('manager reads the confidential inbox, answers and escalates', async () => {
  await mount(<ManagerWellbeing />);
  await click(tab('ethics'));
  const row = container.querySelector('[data-testid="ethics-row"]');
  expect(row.textContent).toContain('Anónimo');
  expect(row.textContent).toContain('Me gritan frente al equipo.');
  await setValue(container.querySelector('[data-testid="ethics-reply"]'), 'Gracias, lo revisamos.');
  await click(container.querySelector('[data-testid="ethics-respond"]'));
  expect(api.respondEthics).toHaveBeenCalledWith('e1', { message: 'Gracias, lo revisamos.', status: 'in_review' }, SCOPE);
  await click(container.querySelector('[data-testid="ethics-escalate-committee"]'));
  expect(api.escalateEthics).toHaveBeenCalledWith('e1', { to: 'convivencia' }, SCOPE);
  await click(tab('beneficiaries'));
  expect(container.querySelector('[data-testid="beneficiary-manager-row"]').textContent).toContain('con documento');
});
