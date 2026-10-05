// Interpreta un 409 de la reserva (cita o clase grupal) para decidir que mensaje mostrar y a que paso volver.
// CLASS_ALREADY_BOOKED: el cliente ya tiene su cupo; se queda en el formulario con el mensaje (volver a elegir hora no ayuda).
export function describeBookingConflict(detail) {
  const code = typeof detail === 'object' ? detail?.code : null;
  const message = typeof detail === 'object' ? detail?.message : detail;
  if (code === 'APPOINTMENT_TIME_IN_PAST') return { message: 'Este horario ya pasó. Selecciona uno posterior.', backToStep: 3 };
  if (code === 'CLASS_ALREADY_BOOKED') return { message, backToStep: null };
  if (code === 'CLASS_NOT_OPEN_YET' || code === 'CLASS_FULL') return { message, backToStep: 3 };
  return { message: message || 'El horario acaba de cambiar o ya fue reservado. Selecciona otro.', backToStep: 3 };
}
