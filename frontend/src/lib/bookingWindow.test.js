import { bookingWindowLabel, bookingWindowNotice, formatOpensOn } from './bookingWindow';

test('one day is explained as 24 hours and other windows as days', () => {
  expect(bookingWindowLabel(1)).toBe('24 horas');
  expect(bookingWindowLabel(3)).toBe('3 días');
});

test('the notice tells the client that a session farther away must wait', () => {
  const notice = bookingWindowNotice(1);
  expect(notice).toContain('24 horas de anticipación');
  expect(notice).toContain('vuelve cuando falte ese tiempo');
});

test('formats the opening date as dd/mm/yyyy and tolerates missing values', () => {
  expect(formatOpensOn('2026-10-06')).toBe('06/10/2026');
  expect(formatOpensOn(undefined)).toBe('');
});
