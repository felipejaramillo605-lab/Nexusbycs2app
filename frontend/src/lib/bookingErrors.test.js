import { describeBookingConflict } from './bookingErrors';

test('an already-booked class keeps the user on the form with the message (no bounce back to the date step)', () => {
  expect(describeBookingConflict({ code: 'CLASS_ALREADY_BOOKED', message: 'Ya tienes un cupo en esta clase.' })).toEqual({
    message: 'Ya tienes un cupo en esta clase.',
    backToStep: null,
  });
});

test('a class that is not open yet or full sends the user back to pick another session, with the server message', () => {
  expect(describeBookingConflict({ code: 'CLASS_NOT_OPEN_YET', message: 'Las reservas de esta clase abren el 06/10/2026.' })).toEqual({
    message: 'Las reservas de esta clase abren el 06/10/2026.',
    backToStep: 3,
  });
  expect(describeBookingConflict({ code: 'CLASS_FULL', message: 'Esta clase ya no tiene cupos disponibles.' }).backToStep).toBe(3);
});

test('a past time and unknown conflicts keep the previous behavior', () => {
  expect(describeBookingConflict({ code: 'APPOINTMENT_TIME_IN_PAST' })).toEqual({ message: 'Este horario ya pasó. Selecciona uno posterior.', backToStep: 3 });
  expect(describeBookingConflict('Time slot not available')).toEqual({ message: 'Time slot not available', backToStep: 3 });
  expect(describeBookingConflict(undefined).message).toContain('Selecciona otro');
});
