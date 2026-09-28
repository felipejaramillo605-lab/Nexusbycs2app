// frontend/src/guide/guideRegistry.test.js
import { GUIDE_MODULES, getModulesForView, checklistCount } from './guideRegistry';

it('registry has the core modules and Owner console in order', () => {
  expect(GUIDE_MODULES.map((m) => m.id)).toEqual([
    'dashboard', 'agenda', 'clientes', 'servicios', 'equipo', 'ingresos', 'premium', 'owner-console',
  ]);
});

it('servicios and equipo are hidden from the staff view', () => {
  const ids = getModulesForView('staff').map((m) => m.id);
  expect(ids).not.toContain('servicios');
  expect(ids).not.toContain('equipo');
  expect(ids).not.toContain('premium');
});

it('owner view includes servicios and equipo', () => {
  const ids = getModulesForView('owner').map((m) => m.id);
  expect(ids).toEqual(expect.arrayContaining(['servicios', 'equipo']));
  expect(ids).toContain('premium');
});

it('manager view includes the Premium guide and staff cannot see it', () => {
  expect(getModulesForView('manager').map((m) => m.id)).toContain('premium');
  expect(getModulesForView('staff').map((m) => m.id)).not.toContain('premium');
});

it('Premium guidance is role-specific and documents its bundle and invoice flow', () => {
  const premium = GUIDE_MODULES.find((m) => m.id === 'premium');
  expect(premium.visibleTo).toEqual(['owner', 'manager']);
  expect(premium.content.perRole.manager.steps[0].substeps.join(' ')).toContain('Configuración');
  const guideCopy = [
    ...premium.content.perRole.owner.steps,
    ...premium.content.perRole.owner.pitfalls,
    ...premium.content.perRole.manager.steps,
    ...premium.content.perRole.manager.checklist,
    ...premium.content.perRole.owner.checklist,
  ].map((item) => `${item.title || ''} ${item.label || ''} ${item.problem || ''} ${item.expected || ''} ${item.substeps?.join(' ') || ''} ${item.fix || ''}`).join(' ');
  expect(guideCopy).toContain('factura manual');
  expect(guideCopy).toContain('pago completo');
  expect(guideCopy).toContain('motivo');
  expect(guideCopy).toContain('Nexus AI');
  expect(guideCopy).toContain('plantillas premium');
});

it('every module exposes content.perRole for each view it claims', () => {
  for (const m of GUIDE_MODULES) {
    for (const v of m.visibleTo) {
      expect(m.content.perRole[v]).toBeDefined();
    }
  }
});

it('Owner console is available only in the owner view', () => {
  const module = GUIDE_MODULES.find((m) => m.id === 'owner-console');
  expect(module.visibleTo).toEqual(['owner']);
  expect(Object.keys(module.content.perRole)).toEqual(['owner']);
  expect(getModulesForView('owner')).toContain(module);
  expect(getModulesForView('manager')).not.toContain(module);
  expect(getModulesForView('staff')).not.toContain(module);
  expect(checklistCount('owner-console', 'manager')).toBe(0);
});

it('checklistCount returns 0 for a view with no guide', () => {
  expect(checklistCount('servicios', 'staff')).toBe(0);
});
