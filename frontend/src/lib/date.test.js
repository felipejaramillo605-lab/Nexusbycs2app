import { localDateString } from './date';

describe('localDateString', () => {
  test('formats a given date as YYYY-MM-DD using its local fields, not UTC', () => {
    const date = new Date(2026, 8, 29, 23, 30); // local: 2026-09-29 23:30
    expect(localDateString(date)).toBe('2026-09-29');
  });

  test('pads single-digit month and day', () => {
    const date = new Date(2026, 0, 5); // local: 2026-01-05
    expect(localDateString(date)).toBe('2026-01-05');
  });

  test('defaults to the current local date when no argument is given', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(localDateString()).toBe(expected);
  });

  test('reads local date fields, never UTC ones -- the exact bug this helper fixes', () => {
    // 23:59:59 local time: toISOString() on this instant would already read
    // as the next UTC day in any zone behind UTC (e.g. Colombia, UTC-5).
    // localDateString must report the LOCAL day regardless.
    const lateAtNight = new Date(2026, 8, 29, 23, 59, 59);
    expect(localDateString(lateAtNight)).toBe('2026-09-29');
  });
});
