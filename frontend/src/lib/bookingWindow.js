// Texto para explicar la ventana de reserva de una clase grupal (booking_window_days).
// 1 dia se dice "24 horas"; si la sesion esta mas lejos, el cliente debe esperar a que falte ese tiempo.
export const bookingWindowLabel = (days) => (Number(days) === 1 ? '24 horas' : `${days} días`);

export const formatOpensOn = (iso) => {
  const [year, month, day] = String(iso || '').split('-');
  return day && month && year ? `${day}/${month}/${year}` : '';
};

export const bookingWindowNotice = (days) =>
  `Esta clase solo se puede reservar con ${bookingWindowLabel(days)} de anticipación. Si la sesión está más lejos, vuelve cuando falte ese tiempo para poder reservar.`;
