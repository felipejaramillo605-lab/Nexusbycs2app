// NEXUS_GROUP_SERVICES_V1: clases con cupo limitado -- Fase 1 (modelo de clase
// + reserva grupal + capacidad + bloqueo de agenda del instructor). Aditivo,
// no toca AppointmentsHistory.js ni el checkout 1:1 existente.
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckSquare, LogOut, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { classSessionAPI, serviceAPI, barberAPI } from '../api';
import { AccessibleModal, ActionButton, DetailDrawer, EmptyState, FieldGuide, LoadingState, MotionPage, PageHeader, StatusBadge, AdminShell } from '../components/design';

const detail = (error, fallback) => error?.response?.data?.detail || fallback;
const blankForm = { service_id: '', barber_id: '', date: '', time: '' };
const blankCheckout = { discount_amount: 0, tip_amount: 0, payment_method: 'cash', notes: '' };

export default function ManagerClasses() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? searchParams.get('org_id') : user?.organization_id) || user?.organization_id;

  const [sessions, setSessions] = useState([]), [loading, setLoading] = useState(true);
  const [groupServices, setGroupServices] = useState([]), [barbers, setBarbers] = useState([]);
  const [showNew, setShowNew] = useState(false), [form, setForm] = useState(blankForm), [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null), [selected, setSelected] = useState(null), [selectedLoading, setSelectedLoading] = useState(false);
  const [checkoutFor, setCheckoutFor] = useState(null), [checkoutForm, setCheckoutForm] = useState(blankCheckout), [checkingOut, setCheckingOut] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [sessionsRes, servicesRes, barbersRes] = await Promise.all([
        classSessionAPI.list({ organization_id: organizationId }),
        serviceAPI.getAll({ organization_id: organizationId }),
        barberAPI.getAll({ organization_id: organizationId }),
      ]);
      setSessions(sessionsRes.data || []);
      setGroupServices((servicesRes.data || []).filter(s => s.service_type === 'group'));
      setBarbers(barbersRes.data || []);
    } catch (error) {
      toast.error('No fue posible cargar las clases');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);
  useEffect(() => { load(); }, [load]);

  const serviceById = (id) => groupServices.find(s => s.service_id === id);
  const barberById = (id) => barbers.find(b => b.barber_id === id);

  const openSession = async (session) => {
    setSelectedId(session.class_session_id);
    setSelectedLoading(true);
    setSelected(null);
    try {
      const r = await classSessionAPI.getBookings(session.class_session_id);
      setSelected(r.data);
    } catch (error) {
      toast.error(detail(error, 'No fue posible cargar la clase'));
      setSelectedId(null);
    } finally {
      setSelectedLoading(false);
    }
  };
  const closeDrawer = () => { setSelectedId(null); setSelected(null); };

  const createSession = async (e) => {
    e.preventDefault();
    if (!form.service_id || !form.barber_id || !form.date || !form.time) return;
    setCreating(true);
    try {
      await classSessionAPI.create(form);
      toast.success('Clase agendada');
      setShowNew(false);
      setForm(blankForm);
      await load();
    } catch (error) {
      toast.error(detail(error, 'No fue posible agendar la clase'));
    } finally {
      setCreating(false);
    }
  };

  const cancelSession = async (session) => {
    if (!window.confirm(`¿Cancelar la clase de ${serviceById(session.service_id)?.name || 'servicio'} del ${session.date}? Se cancelarán las reservas de los inscritos.`)) return;
    try {
      await classSessionAPI.cancel(session.class_session_id);
      toast.success('Clase cancelada');
      closeDrawer();
      await load();
    } catch (error) {
      toast.error(detail(error, 'No fue posible cancelar la clase'));
    }
  };

  const submitCheckout = async (e) => {
    e.preventDefault();
    if (!checkoutFor) return;
    setCheckingOut(true);
    try {
      await classSessionAPI.checkoutBooking(checkoutFor.class_booking_id, checkoutForm);
      toast.success(`Cobro registrado a ${checkoutFor.client_name}`);
      setCheckoutFor(null);
      setCheckoutForm(blankCheckout);
      await openSession({ class_session_id: selectedId });
    } catch (error) {
      toast.error(detail(error, 'No fue posible registrar el cobro'));
    } finally {
      setCheckingOut(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = sessions.filter(s => s.status === 'scheduled' && s.date >= today);
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <AdminShell organizationName={user?.organization_name} organizationId={organizationId} actions={<ActionButton variant="ghost" icon={LogOut} onClick={handleLogout}>Salir</ActionButton>}>
      <MotionPage className="space-y-6">
        <PageHeader
          eyebrow="Operación"
          title="Clases"
          description="Servicios grupales con cupo limitado -- agenda una clase, mira quién se inscribió y cobra a cada asistente."
          actions={groupServices.length > 0 ? <ActionButton icon={Plus} onClick={() => setShowNew(true)}>Agendar clase</ActionButton> : null}
        />

        {loading ? (
          <LoadingState label="Cargando clases" />
        ) : groupServices.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin servicios grupales todavía"
            description="Crea un servicio y márcalo como 'Grupal (clase)' en Servicios antes de poder agendar una clase aquí."
            action={<ActionButton variant="secondary" onClick={() => navigate(`/manager/services${organizationId ? `?org_id=${organizationId}` : ''}`)}>Ir a Servicios</ActionButton>}
          />
        ) : upcoming.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Sin clases agendadas" description="Agenda tu primera clase para empezar a recibir reservas." action={<ActionButton icon={Plus} onClick={() => setShowNew(true)}>Agendar clase</ActionButton>} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map(session => {
              const svc = serviceById(session.service_id);
              const instructor = barberById(session.barber_id);
              const full = session.booked_count >= session.capacity;
              return (
                <button key={session.class_session_id} onClick={() => openSession(session)} className="text-left p-5 rounded-2xl bg-white/3 border border-[var(--app-border)] hover:bg-white/6 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[var(--app-text-primary)] font-medium">{svc?.name || 'Servicio'}</p>
                      <p className="text-sm text-[var(--app-text-secondary)]">{instructor?.display_name || instructor?.name || 'Instructor'}</p>
                    </div>
                    <StatusBadge tone={full ? 'warning' : 'success'}>{session.booked_count}/{session.capacity}</StatusBadge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--app-text-secondary)]">
                    <CalendarClock size={14} /> {session.date} · {session.time}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {showNew && (
          <AccessibleModal open={showNew} onClose={() => !creating && setShowNew(false)} labelledBy="class-new-title" describedBy="class-new-description" panelClassName="nexus-accessible-modal-panel">
            <h2 id="class-new-title">Agendar clase</h2>
            <p id="class-new-description">Elige el servicio grupal, el instructor, la fecha y la hora. Se bloqueará esa franja en la agenda del instructor.</p>
            <form className="nexus-guided-form mt-4" onSubmit={createSession}>
              <label className="nexus-field-wide"><FieldGuide label="Servicio grupal" required /><select value={form.service_id} onChange={e => setForm({ ...form, service_id: e.target.value, barber_id: '' })} required><option value="">Selecciona un servicio</option>{groupServices.map(s => <option key={s.service_id} value={s.service_id}>{s.name} ({s.group_capacity} cupos)</option>)}</select></label>
              <label className="nexus-field-wide"><FieldGuide label="Instructor" required /><select value={form.barber_id} onChange={e => setForm({ ...form, barber_id: e.target.value })} required disabled={!form.service_id}><option value="">Selecciona un instructor</option>{barbers.filter(b => { const ids = b.service_ids || []; return !ids.length || ids.includes(form.service_id); }).map(b => <option key={b.barber_id} value={b.barber_id}>{b.display_name || b.name}</option>)}</select></label>
              <label><FieldGuide label="Fecha" required /><input type="date" min={today} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required /></label>
              <label><FieldGuide label="Hora" required /><input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} required /></label>
              <div className="nexus-account-actions mt-2"><ActionButton type="button" variant="secondary" onClick={() => setShowNew(false)} disabled={creating}>Cancelar</ActionButton><ActionButton type="submit" icon={Plus} loading={creating}>Agendar clase</ActionButton></div>
            </form>
          </AccessibleModal>
        )}

        <DetailDrawer open={!!selectedId} onClose={closeDrawer} title={selected ? `${serviceById(selected.session.service_id)?.name || 'Clase'} · ${selected.session.date} ${selected.session.time}` : 'Clase'} description={selected ? `${selected.session.booked_count}/${selected.session.capacity} cupos ocupados` : ''}>
          {selectedLoading ? <LoadingState label="Cargando inscritos" /> : selected && (
            <div className="space-y-4">
              {selected.bookings.length === 0 ? (
                <EmptyState icon={Users} title="Sin inscritos" description="Todavía nadie ha reservado un cupo en esta clase." />
              ) : (
                <div className="nexus-audit-list">
                  {selected.bookings.map(b => (
                    <div key={b.class_booking_id} className="p-3 rounded-xl border border-[var(--app-border)] flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[var(--app-text-primary)] font-medium">{b.client_name}</p>
                        <p className="text-xs text-[var(--app-text-secondary)]">{b.client_phone}</p>
                      </div>
                      {b.status === 'completed' ? (
                        <StatusBadge tone="success">Cobrado</StatusBadge>
                      ) : (
                        <ActionButton variant="secondary" onClick={() => { setCheckoutFor(b); setCheckoutForm(blankCheckout); }}>Cobrar</ActionButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {selected.session.status === 'scheduled' && (
                <ActionButton variant="destructive" icon={Trash2} onClick={() => cancelSession(selected.session)}>Cancelar clase</ActionButton>
              )}
            </div>
          )}
        </DetailDrawer>

        {checkoutFor && (
          <AccessibleModal open={!!checkoutFor} onClose={() => !checkingOut && setCheckoutFor(null)} labelledBy="class-checkout-title" panelClassName="nexus-accessible-modal-panel">
            <h2 id="class-checkout-title">Cobrar a {checkoutFor.client_name}</h2>
            <form className="nexus-guided-form mt-4" onSubmit={submitCheckout}>
              <label><FieldGuide label="Descuento" /><input type="number" min="0" value={checkoutForm.discount_amount} onChange={e => setCheckoutForm({ ...checkoutForm, discount_amount: e.target.value })} /></label>
              <label><FieldGuide label="Propina" /><input type="number" min="0" value={checkoutForm.tip_amount} onChange={e => setCheckoutForm({ ...checkoutForm, tip_amount: e.target.value })} /></label>
              <label className="nexus-field-wide"><FieldGuide label="Medio de pago" required /><select value={checkoutForm.payment_method} onChange={e => setCheckoutForm({ ...checkoutForm, payment_method: e.target.value })}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="other">Otro</option></select></label>
              <div className="nexus-account-actions mt-2"><ActionButton type="button" variant="secondary" onClick={() => setCheckoutFor(null)} disabled={checkingOut}>Cancelar</ActionButton><ActionButton type="submit" icon={CheckSquare} loading={checkingOut}>Confirmar cobro</ActionButton></div>
            </form>
          </AccessibleModal>
        )}
      </MotionPage>
    </AdminShell>
  );
}
