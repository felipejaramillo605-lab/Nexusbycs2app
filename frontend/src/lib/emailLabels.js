// Espejo de backend/email_labels.py: listas cerradas de iconos y palabras sugeridas para los correos de citas.
export const SERVICE_ICON_CHOICES = ['✂️', '💈', '💆', '💅', '💄', '✨', '🌿', '🧘', '🏋️', '🩺', '🥗', '🐾', '🎨', '📋', '🗓️', '⭐'];
export const PROFESSIONAL_ICON_CHOICES = ['👤', '💇', '🧑‍⚕️', '🧑‍🏫', '🧑‍🎨', '🤝', '⭐', '🌟'];
export const SERVICE_WORD_SUGGESTIONS = ['Servicio', 'Sesión', 'Consulta', 'Clase', 'Tratamiento', 'Terapia', 'Cita'];
export const PROFESSIONAL_WORD_SUGGESTIONS = ['Profesional', 'Especialista', 'Terapeuta', 'Instructor', 'Estilista', 'Entrenador'];
export const MAX_EMAIL_WORD_LENGTH = 24;

const WORD_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,&/'()+-]+$/;

export function isValidEmailWord(value) {
  const word = String(value || '').trim();
  return word === '' || (word.length <= MAX_EMAIL_WORD_LENGTH && WORD_PATTERN.test(word));
}

// Solo viajan al servidor los valores que el manager cambió; vacío = usar el predeterminado de su tipo de negocio.
export function customEmailLabels(draft) {
  const result = {};
  ['service_icon', 'professional_icon', 'service_label', 'professional_label'].forEach((key) => {
    const value = String(draft?.[key] || '').trim();
    if (value) result[key] = value;
  });
  return result;
}
