import { describeValidationDetail } from './index';

test('turns FastAPI validation errors into readable text instead of objects', () => {
  const detail = [{ type: 'greater_than', loc: ['body', 'lines', 2, 'quantity'], msg: 'Input should be greater than 0', input: 0 }];
  expect(describeValidationDetail(detail)).toBe('Revisa los datos: quantity: Input should be greater than 0');
});

test('leaves plain messages and structured errors untouched', () => {
  expect(describeValidationDetail('Orden no disponible')).toBe('Orden no disponible');
  const structured = { code: 'X', message: 'm' };
  expect(describeValidationDetail(structured)).toBe(structured);
});
