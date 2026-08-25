export const ONBOARDING_STEPS = {
  owner: [
    { illustration: 'dashboard', title: 'Bienvenido, eres el Owner', description: 'Tienes visibilidad de todas las organizaciones que administras: suscripciones, facturacion y control de accesos desde un solo lugar.' },
    { illustration: 'billing', title: 'Suscripciones y facturas', description: 'En "Suscripciones" configuras el plan mensual de cada organizacion, emites facturas y confirmas pagos manuales.' },
    { illustration: 'team', title: 'Control de accesos', description: 'Aprueba o rechaza el acceso de nuevos managers y administra que organizaciones estan activas.' },
    { illustration: 'portal', title: 'Portal de cada cliente final', description: 'Cada organizacion puede personalizar su propio portal de reservas: logo, colores y mensaje de bienvenida, desde "Mi Portal".' },
  ],
  manager: [
    { illustration: 'dashboard', title: 'Este es tu panel de negocio', description: 'Aqui ves tus citas de hoy, ingresos y accesos rapidos a lo mas importante de tu dia a dia.' },
    { illustration: 'calendar', title: 'Agenda y citas', description: 'Gestiona la disponibilidad de tu equipo, agenda citas manualmente y revisa el calendario completo.' },
    { illustration: 'clients', title: 'Tus clientes', description: 'Cada cliente tiene su historial de visitas, servicios preferidos y datos de contacto centralizados.' },
    { illustration: 'billing', title: 'Ingresos y facturacion', description: 'Consulta tus facturas de suscripcion a Nexus y el detalle de tus ingresos por servicio.' },
    { illustration: 'portal', title: 'Personaliza tu portal', description: 'En Configuracion, Mi Portal puedes subir tu logo, elegir un tema de color y decidir que informacion ve tu cliente al agendar.' },
  ],
  staff: [
    { illustration: 'dashboard', title: 'Bienvenido al equipo', description: 'Desde aqui ves las citas asignadas a ti y el estado de tu jornada.' },
    { illustration: 'calendar', title: 'Tu agenda', description: 'Revisa tus proximas citas, marca cuales ya se realizaron y confirma disponibilidad.' },
    { illustration: 'clients', title: 'Historial de clientes', description: 'Antes de cada cita puedes ver el historial y preferencias del cliente que vas a atender.' },
  ],
  client: [
    { illustration: 'portal', title: 'Bienvenido a tu portal', description: 'Aqui puedes ver tu proxima cita, tu historial de visitas y actualizar tus datos.' },
    { illustration: 'booking', title: 'Agendar una cita', description: 'Elige el servicio, el profesional de tu preferencia y el horario que mejor te quede, en pocos pasos.' },
    { illustration: 'calendar', title: 'Gestiona tus citas', description: 'Puedes confirmar, reagendar o cancelar tus citas desde "Mis Citas" en cualquier momento.' },
  ],
};

export const ONBOARDING_ROLE_LABEL = {
  owner: 'Owner',
  manager: 'Manager',
  admin: 'Manager',
  staff: 'Staff',
  client: 'Cliente',
};
