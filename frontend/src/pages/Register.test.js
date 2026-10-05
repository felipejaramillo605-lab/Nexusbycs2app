import fs from 'fs';
import path from 'path';

test('business registration requires an adult declaration and sends it to the API', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Register.js'), 'utf8');
  expect(source).toContain('Declaro ser mayor de 18 años');
  expect(source).toContain('adult_confirmed: adultConfirmed');
  expect(source).toContain('!adultConfirmed');
});
