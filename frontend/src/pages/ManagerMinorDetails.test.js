import fs from 'fs';
import path from 'path';

const source = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('dashboard counts active loaded professionals instead of appointments', () => {
  const dashboard = source('ManagerDashboard.js');
  expect(dashboard).toContain('barbers.filter(item=>item.active!==false&&item.is_active!==false).length');
  expect(dashboard).not.toContain('new Set(appointments.map(item=>item.barber_id)).size');
});

test('dashboard exposes every professional in the agenda filter', () => {
  const dashboard = source('ManagerDashboard.js');
  expect(dashboard).toContain('...barbers.map(item=>');
  expect(dashboard).not.toContain('barbers.slice(0,3)');
});

test('SKU normalization requires a confirmation that states affected references', () => {
  const inventory = source('ManagerInventory.js');
  expect(inventory).toContain('confirmAction(`¿Normalizar SKU de ${items.length} referencias?');
  expect(inventory).toContain('if(!await confirmAction');
});
