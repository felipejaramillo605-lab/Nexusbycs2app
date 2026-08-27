// frontend/src/guide/resolveView.test.js
import { viewsForRole, resolveView, VIEW_ORDER } from './resolveView';

describe('viewsForRole', () => {
  it('owner sees all three in order', () => {
    expect(viewsForRole('owner')).toEqual(['owner', 'manager', 'staff']);
  });
  it('manager sees manager + staff', () => {
    expect(viewsForRole('manager')).toEqual(['manager', 'staff']);
  });
  it('admin is treated as manager', () => {
    expect(viewsForRole('admin')).toEqual(['manager', 'staff']);
  });
  it('staff sees only staff', () => {
    expect(viewsForRole('staff')).toEqual(['staff']);
  });
  it('unknown role falls back to staff-only', () => {
    expect(viewsForRole(undefined)).toEqual(['staff']);
    expect(viewsForRole('weird')).toEqual(['staff']);
  });
});

describe('resolveView', () => {
  it('honors a permitted requested view', () => {
    expect(resolveView('owner', 'staff')).toEqual({
      views: ['owner', 'manager', 'staff'],
      activeView: 'staff',
    });
  });
  it('rejects a forbidden requested view and uses the default', () => {
    expect(resolveView('staff', 'owner')).toEqual({
      views: ['staff'],
      activeView: 'staff',
    });
  });
  it('uses the first view when requested is null', () => {
    expect(resolveView('manager', null)).toEqual({
      views: ['manager', 'staff'],
      activeView: 'manager',
    });
  });
  it('VIEW_ORDER is owner, manager, staff', () => {
    expect(VIEW_ORDER).toEqual(['owner', 'manager', 'staff']);
  });
});
