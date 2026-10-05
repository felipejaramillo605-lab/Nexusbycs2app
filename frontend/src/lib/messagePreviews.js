// Text-only previews; delivery and credentials belong exclusively to the backend.
export const MESSAGE_TEMPLATES = {
  APPOINTMENT_REMINDER: 'appointment_reminder',
  REACTIVATION: 'reactivation',
  PROMOTION: 'promotion',
  BIRTHDAY: 'birthday',
};

export const VERTICAL_LABELS = {
  barbershop: 'Barbería', hair_salon: 'Peluquería', nail_spa: 'Spa de uñas',
  lash_spa: 'Spa de pestañas', beauty_salon: 'Salón de belleza',
  wellness_spa: 'Spa y bienestar', pilates_studio: 'Estudio de pilates', health_clinic: 'Consultorio',
  professional_services: 'Servicios profesionales', pet_grooming: 'Grooming para mascotas',
};

export const generateReactivationMessageFor = (clientName) =>
  `Hola ${clientName}, hace tiempo que no te vemos. ¡Te esperamos para tu próximo servicio!`;

export const generateBirthdayMessage = (clientName, businessName = 'Nexus', rewardCode = null) =>
  `¡Feliz cumpleaños, ${clientName}! Todo el equipo de ${businessName} te desea un gran día.` +
  (rewardCode ? ` Tu regalo: presenta el código ${rewardCode} en tu próxima visita.` : '');

export const whatsappKind = (template) =>
  template === MESSAGE_TEMPLATES.APPOINTMENT_REMINDER ? 'reminder' : 'promotion';
