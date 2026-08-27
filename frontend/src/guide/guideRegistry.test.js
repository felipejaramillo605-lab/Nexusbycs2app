// frontend/src/guide/guideRegistry.test.js
import { GUIDE_MODULES, getModulesForView, checklistCount } from './guideRegistry';

it('registry has the 6 core modules in order', () => {
  expect(GUIDE_MODULES.map((m) => m.id)).toEqual([
    'dashboard', 'agenda', 'clientes', 'servicios', 'equipo', 'ingresos',
  ]);
});

it('servicios and equipo are hidden from the staff view', () => {
  const ids = getModulesForView('staff').map((m) => m.id);
  expect(ids).not.toContain('servicios');
  expect(ids).not.toContain('equipo');
});

it('owner view includes servicios and equipo', () => {
  const ids = getModulesForView('owner').map((m) => m.id);
  expect(ids).toEqual(expect.arrayContaining(['servicios', 'equipo']));
});

it('every module exposes content.perRole for each view it claims', () => {
  for (const m of GUIDE_MODULES) {
    for (const v of m.visibleTo) {
      expect(m.content.perRole[v]).toBeDefined();
    }
  }
});

it('checklistCount returns 0 for a view with no guide', () => {
  expect(checklistCount('servicios', 'staff')).toBe(0);
});
