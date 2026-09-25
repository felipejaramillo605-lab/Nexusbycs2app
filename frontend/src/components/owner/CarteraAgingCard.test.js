import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CarteraAgingCard from './CarteraAgingCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../design', () => {
  const React = jest.requireActual('react');
  const Box = ({ children, ...props }) => React.createElement('section', props, children);
  return {
    EmptyState: ({ title, description }) => React.createElement('div', null, title, description),
    SurfaceCard: Box,
  };
});

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

async function renderComponent(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<CarteraAgingCard {...props} />);
  });
  return { host, root };
}

async function cleanup(root) {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
}

describe('CarteraAgingCard', () => {
  let root;
  afterEach(() => cleanup(root));

  test('shows the empty state when there is no pending balance', async () => {
    const rendered = await renderComponent({
      invoices: [
        { invoice_id: 'inv-1', status: 'paid', amount_minor: 100000, currency: 'COP', due_at: isoDaysAgo(10) },
        { invoice_id: 'inv-2', status: 'void', amount_minor: 50000, currency: 'COP', due_at: isoDaysAgo(5) },
      ],
    });
    root = rendered.root;
    expect(rendered.host.textContent).toContain('Sin saldo pendiente');
  });

  test('groups pending invoices into aging buckets by days overdue', async () => {
    const rendered = await renderComponent({
      invoices: [
        { invoice_id: 'inv-current', status: 'pending', amount_minor: 10000000, currency: 'COP', due_at: isoDaysAgo(-5) },
        { invoice_id: 'inv-1-30', status: 'overdue', amount_minor: 5000000, currency: 'COP', due_at: isoDaysAgo(15) },
        { invoice_id: 'inv-31-60', status: 'overdue', amount_minor: 3000000, currency: 'COP', due_at: isoDaysAgo(45) },
        { invoice_id: 'inv-60-plus', status: 'overdue', amount_minor: 2000000, currency: 'COP', due_at: isoDaysAgo(90) },
        { invoice_id: 'inv-paid', status: 'paid', amount_minor: 1000000, currency: 'COP', due_at: isoDaysAgo(90) },
      ],
    });
    root = rendered.root;
    // Intl.NumberFormat('es-CO') puts a non-breaking space (U+00A0) after the currency symbol.
    const text = rendered.host.textContent.replace(/ /g, ' ');
    expect(text).toContain('$ 100.000');
    expect(text).toContain('$ 50.000');
    expect(text).toContain('$ 30.000');
    expect(text).toContain('$ 20.000');
    // Total pending excludes the paid invoice.
    expect(text).toContain('$ 200.000');
  });
});
