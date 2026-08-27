// frontend/src/guide/guideProgress.test.js
import {
  STORAGE_KEY, readAll, isItemDone, toggleItem, moduleProgress, globalProgress,
} from './guideProgress';

beforeEach(() => window.localStorage.clear());

describe('readAll', () => {
  it('returns {} when nothing stored', () => {
    expect(readAll()).toEqual({});
  });
  it('returns {} on corrupt JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(readAll()).toEqual({});
  });
});

describe('toggleItem / isItemDone', () => {
  it('marks an item done and persists it', () => {
    toggleItem('manager', 'agenda', 'i1');
    expect(isItemDone('manager', 'agenda', 'i1')).toBe(true);
    expect(readAll()).toEqual({ manager: { agenda: { i1: true } } });
  });
  it('toggling twice clears the item, not stores false', () => {
    toggleItem('manager', 'agenda', 'i1');
    toggleItem('manager', 'agenda', 'i1');
    expect(isItemDone('manager', 'agenda', 'i1')).toBe(false);
    expect(readAll()).toEqual({});
  });
  it('keeps views and modules isolated', () => {
    toggleItem('manager', 'agenda', 'i1');
    toggleItem('staff', 'agenda', 'i1');
    expect(isItemDone('owner', 'agenda', 'i1')).toBe(false);
    expect(isItemDone('staff', 'agenda', 'i1')).toBe(true);
  });
});

describe('moduleProgress', () => {
  it('computes done/total/pct', () => {
    toggleItem('manager', 'agenda', 'i1');
    toggleItem('manager', 'agenda', 'i2');
    expect(moduleProgress('manager', 'agenda', 4)).toEqual({ done: 2, total: 4, pct: 50 });
  });
  it('pct is 0 when total is 0', () => {
    expect(moduleProgress('manager', 'x', 0)).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe('globalProgress', () => {
  it('sums across modules', () => {
    toggleItem('manager', 'agenda', 'i1');
    toggleItem('manager', 'clientes', 'c1');
    const mods = [{ id: 'agenda', checklistCount: 3 }, { id: 'clientes', checklistCount: 2 }];
    expect(globalProgress('manager', mods)).toEqual({ done: 2, total: 5, pct: 40 });
  });
});

describe('storage failure resilience', () => {
  it('toggleItem does not throw when setItem throws', () => {
    const spy = jest.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => toggleItem('manager', 'agenda', 'i1')).not.toThrow();
    spy.mockRestore();
  });
});
