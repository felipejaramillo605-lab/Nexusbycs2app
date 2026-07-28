import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicAPI } from '../api';

export default function CancelAppointment() {
  const { appointmentId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;
    if (!appointmentId || !token) {
      setError('Este enlace no es válido o está incompleto.');
      setLoading(false);
      return undefined;
    }
    publicAPI.getAppointment(appointmentId, token)
      .then((response) => { if (active) setAppointment(response.data); })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || 'No fue posible validar este enlace.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId, token]);

  const handleCancel = async () => {
    if (!window.confirm('¿Confirmas que deseas cancelar esta cita?')) return;
    setCancelling(true);
    setError('');
    try {
      await publicAPI.cancelAppointment(appointmentId, token);
      setAppointment((current) => ({ ...current, status: 'cancelled' }));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'No fue posible cancelar la cita.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
        <h1 className="text-3xl font-light mb-2">Gestionar cita</h1>
        <p className="text-zinc-400 mb-6">Consulta los detalles y cancela únicamente si es necesario.</p>
        {loading && <p className="text-zinc-300">Cargando...</p>}
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>}
        {appointment && (
          <>
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
              <p><span className="text-zinc-400">Fecha:</span> {appointment.date}</p>
              <p><span className="text-zinc-400">Hora:</span> {appointment.time}</p>
              <p><span className="text-zinc-400">Servicio:</span> {appointment.service_name}</p>
              <p><span className="text-zinc-400">Profesional:</span> {appointment.barber_name}</p>
            </div>
            {appointment.status === 'cancelled' ? (
              <p className="mt-6 text-green-400">Esta cita está cancelada.</p>
            ) : (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling || appointment.status === 'completed'}
                className="mt-6 w-full rounded-xl bg-red-600 px-5 py-3 font-medium hover:bg-red-500 disabled:opacity-50"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar cita'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
