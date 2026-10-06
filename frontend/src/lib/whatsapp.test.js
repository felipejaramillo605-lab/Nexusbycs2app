import { whatsappHref } from './whatsapp';

test('builds a wa.me link from a phone number and adds the optional message', () => {
  expect(whatsappHref('+57 311 558 7587')).toBe('https://wa.me/573115587587');
  expect(whatsappHref('3115587587', 'Hola')).toBe('https://wa.me/3115587587?text=Hola');
});

test('keeps genuine WhatsApp links and forces https', () => {
  expect(whatsappHref('https://wa.me/573115587587')).toBe('https://wa.me/573115587587');
  expect(whatsappHref('wa.me/573115587587', 'Quiero reservar')).toBe('https://wa.me/573115587587?text=Quiero+reservar');
  expect(whatsappHref('http://api.whatsapp.com/send?phone=573115587587')).toBe('https://api.whatsapp.com/send?phone=573115587587');
  expect(whatsappHref('https://wa.link/abc123', 'Hola')).toBe('https://wa.link/abc123');
});

test('rejects anything that is not a WhatsApp link or a plausible phone', () => {
  expect(whatsappHref('')).toBeNull();
  expect(whatsappHref(null)).toBeNull();
  expect(whatsappHref('javascript:alert(1)')).toBeNull();
  expect(whatsappHref('https://evil.example/wa.me/57311')).toBeNull();
  expect(whatsappHref('https://wa.me.evil.example/57311')).toBeNull();
  expect(whatsappHref('12345')).toBeNull();
  expect(whatsappHref('1234567890123456')).toBeNull();
});
