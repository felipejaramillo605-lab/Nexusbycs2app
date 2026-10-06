// Enlace de WhatsApp seguro a partir de lo que escribe el manager (numero o enlace).
// Solo se aceptan enlaces https de WhatsApp; cualquier otra cosa (javascript:, otros dominios) se descarta.

const ALLOWED_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'wa.link', 'web.whatsapp.com', 'chat.whatsapp.com', 'whatsapp.com']);
const TEXT_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'web.whatsapp.com']);

export function whatsappHref(value, message) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\+?[\d\s().-]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    const url = new URL(`https://wa.me/${digits}`);
    if (message) url.searchParams.set('text', message);
    return url.toString();
  }
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname.replace(/^www\./, ''))) return null;
  url.protocol = 'https:';
  if (message && TEXT_HOSTS.has(url.hostname) && !url.searchParams.has('text')) url.searchParams.set('text', message);
  return url.toString();
}
