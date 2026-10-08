// Texto para explicar la ventana de reserva de una clase grupal (booking_window_days).
// 1 dia se dice "24 horas"; si la sesion esta mas lejos, el cliente debe esperar a que falte ese tiempo.
// `t` es la funcion de traduccion del portal (por defecto solo rellena los marcadores, en espanol).
const spanish = (text, ...args) => text.replace(/\{(\d+)\}/g, (match, index) => args[Number(index)] ?? match);

export const bookingWindowLabel = (days, t = spanish) => (Number(days) === 1 ? t('24 horas') : t('{0} días', days));

export const formatOpensOn = (iso) => {
  const [year, month, day] = String(iso || '').split('-');
  return day && month && year ? `${day}/${month}/${year}` : '';
};

export const bookingWindowNotice = (days, t = spanish) => t(
  'Esta clase solo se puede reservar con {0} de anticipación. Si la sesión está más lejos, vuelve cuando falte ese tiempo para poder reservar.',
  bookingWindowLabel(days, t),
);
