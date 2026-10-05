import React, { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { appointmentAPI, barberAPI, publicAPI } from '../api';
import { ActionButton, SurfaceCard } from './design';

const today = () => new Date().toISOString().slice(0, 10);
const nameOf = (item) => item.display_name || item.name;

// El manager crea una cita presencial en la agenda de cualquier profesional de su organizacion
// (cliente que llega al local o que llama). El cliente nuevo queda como invitado, sin consentimiento de marketing.
export default function ManagerWalkinBooking({ organizationId, onDone, onClose }) {
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({ barber_id: '', service_id: '', date: today(), time: '', client_name: '', client_phone: '', client_email: '' });
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [barberResponse, serviceResponse] = await Promise.all([
          barberAPI.getAll({ organization_id: organizationId }),
          publicAPI.getServices(organizationId),
        ]);
        setBarbers(barberResponse.data || []);
        setServices(serviceResponse.data || []);
      } catch (_) {
        setError('No fue posible cargar profesionales y servicios.');
      }
    })();
  }, [organizationId]);

  useEffect(() => {
    if (!form.barber_id || !form.service_id || !form.date) {
      setSlots([]);
      return;
    }
    publicAPI
      .getAvailability(organizationId, form.barber_id, form.date, form.service_id)
      .then((response) => setSlots(response.data?.available_slots || response.data?.slots || []))
      .catch(() => setSlots([]));
  }, [organizationId, form.barber_id, form.service_id, form.date]);

  // La hora elegida solo se invalida cuando cambia lo que define la disponibilidad.
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value, ...(['barber_id', 'service_id', 'date'].includes(key) ? { time: '' } : {}) }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await appointmentAPI.createWalkin({ ...form, organization_id: organizationId });
      setSuccess(response.data);
      onDone?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(detail?.message || (typeof detail === 'string' ? detail : 'No fue posible crear la cita.'));
    } finally {
      setSaving(false);
    }
  };

  const portal = `${window.location.origin}/portal/${organizationId}`;

  if (success) {
    return (
      <SurfaceCard>
        <h2>Cita confirmada</h2>
        <p>Comparte el portal del cliente para que la próxima vez reserve solo. Sus datos se usan solo para gestionar esta cita.</p>
        <div className="flex gap-2 flex-wrap">
          <ActionButton variant="secondary" icon={Copy} onClick={() => navigator.clipboard?.writeText(portal)}>Copiar enlace</ActionButton>
          <ActionButton
            variant="secondary"
            icon={Share2}
            onClick={() => navigator.share?.({ title: 'Portal de clientes', text: `Para tu próxima cita usa ${portal}`, url: portal })}
          >
            Compartir por WhatsApp
          </ActionButton>
          <ActionButton onClick={() => onClose?.()}>Cerrar</ActionButton>
        </div>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard>
      <div className="flex justify-between gap-3">
        <div>
          <h2 id="manager-walkin-title">Nueva cita presencial</h2>
          <p className="text-sm">Para un cliente que llega o llama · sin consentimiento de marketing.</p>
        </div>
        <button type="button" onClick={onClose}>Cerrar</button>
      </div>
      <form onSubmit={submit} className="nexus-form-grid mt-4">
        <label>
          Profesional
          <select className="nexus-field" required value={form.barber_id} onChange={(e) => set('barber_id', e.target.value)}>
            <option value="">Selecciona</option>
            {barbers.map((item) => <option key={item.barber_id} value={item.barber_id}>{nameOf(item)}</option>)}
          </select>
        </label>
        <label>
          Servicio
          <select className="nexus-field" required value={form.service_id} onChange={(e) => set('service_id', e.target.value)}>
            <option value="">Selecciona</option>
            {services.map((item) => <option key={item.service_id} value={item.service_id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Fecha
          <input className="nexus-field" type="date" min={today()} required value={form.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        <label>
          Hora
          <select className="nexus-field" required value={form.time} onChange={(e) => set('time', e.target.value)}>
            <option value="">Selecciona</option>
            {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
          </select>
        </label>
        <label>
          Teléfono
          <input className="nexus-field" required value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} />
        </label>
        <label>
          Nombre
          <input className="nexus-field" required value={form.client_name} onChange={(e) => set('client_name', e.target.value)} />
        </label>
        <label>
          Correo (opcional)
          <input className="nexus-field" type="email" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} />
        </label>
        {error && <p role="alert" className="text-amber-400 text-sm">{error}</p>}
        <ActionButton loading={saving}>Confirmar cita</ActionButton>
      </form>
    </SurfaceCard>
  );
}
