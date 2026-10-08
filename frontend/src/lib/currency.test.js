import { formatCOP, formatCOPMinor, getActiveCurrency, setActiveCurrency } from './currency';

afterEach(() => setActiveCurrency('COP'));

const flat = (text) => text.replace(/\s/g, '');

test('without an organization the amounts stay in Colombian pesos, no decimals', () => {
  expect(getActiveCurrency()).toBe('COP');
  expect(flat(formatCOP(45000))).toBe('$45.000');
  expect(flat(formatCOP(0))).toBe('$0');
});

test('an organization that operates in the US shows dollars with cents', () => {
  setActiveCurrency('USD');
  expect(flat(formatCOP(25))).toBe('$25.00');
  expect(flat(formatCOP(1234.5))).toBe('$1,234.50');
});

test('an unknown currency falls back to pesos and an explicit currency wins over the active one', () => {
  setActiveCurrency('EUR');
  expect(getActiveCurrency()).toBe('COP');
  setActiveCurrency('USD');
  expect(flat(formatCOP(45000, 'COP'))).toBe('$45.000');
});

test('Nexus subscription amounts in minor units keep their own currency', () => {
  setActiveCurrency('USD');
  expect(flat(formatCOPMinor(7000000))).toBe('$70.000');
  expect(flat(formatCOPMinor(2500, 'USD'))).toBe('$25.00');
});
