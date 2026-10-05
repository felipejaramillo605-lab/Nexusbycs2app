import { readFileSync } from 'fs';
import { adminSections, getAdminSections } from '../components/design/adminNavigation';
import { PawPrint, Scissors } from 'lucide-react';

const paths = adminSections.flatMap((section) => section.items.map(([path]) => path));

describe('AdminShell navigation', () => {
  test('keeps Business Profile and removes legacy settings links', () => {
    expect(paths).toContain('/manager/business-profile');
    expect(paths.filter((path) => path === '/manager/settings')).toHaveLength(1);
    expect(adminSections.flatMap((section) => section.items).find(([path]) => path === '/manager/settings')[1]).toBe('Configuración');
    const shell = readFileSync(require.resolve('../components/design/AdminShell.jsx'), 'utf8');
    expect(shell).not.toContain('/account/privacy');
    expect(paths).not.toEqual(expect.arrayContaining([
      '/manager/billing',
      '/manager/fiscal-profile',
      '/account/privacy',
    ]));
  });

  test('uses the configured business icon for the Services navigation item', () => {
    const serviceItem = getAdminSections('pet_grooming').flatMap((section) => section.items).find(([path]) => path === '/manager/services');
    expect(serviceItem[2]).toBe(PawPrint);
    expect(getAdminSections('barbershop').flatMap((section) => section.items).find(([path]) => path === '/manager/services')[2]).toBe(Scissors);
  });
});
