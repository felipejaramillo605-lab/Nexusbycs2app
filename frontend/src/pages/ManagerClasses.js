// NEXUS_GROUP_SERVICES_V1: clases con cupo limitado -- Fase 1 (modelo de clase
// + reserva grupal + capacidad + bloqueo de agenda del instructor). Aditivo,
// no toca AppointmentsHistory.js ni el checkout 1:1 existente.
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckSquare, LogOut, Pause, Play, Plus, Repeat, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { classSessionAPI, classScheduleTemplateAPI, serviceAPI, barberAPI } from '../api';
import { AccessibleModal, ActionButton, DetailDrawer, EmptyState, FieldGuide, LoadingState, MotionPage, PageHeader, StatusBadge, AdminShell } from '../components/design';

const detail = (error, fallback) => error?.response?.data?.detail || fallback;
const blankForm = { service_id: '', barber_id: '', date: '', time: '' };
const blankCheckout = { discount_amount: 0, tip_amount: 0, payment_method: 'cash', notes: '' };
// NEXUS_CLASS_RECURRING_SCHEDULE_V1
const WEEKDAYS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];
const blankTemplate = { service_id: '', barber_id: '', substitute_barber_id: '', days_of_week: [], time: '', capacity: '', start_date: '', end_date: '' };

export default function ManagerClasses() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? searchParams.get('org_id') : user?.organization_id) || user?.organization_id;

  const [tab, setTab] = useState('calendar'); // 'calendar' | 'recurring'
  const [sessions, setSessions] = useState([]), [loading, setLoading] = useState(true);
  const [groupServices, setGroupServices] = useState([]), [barbers, setBarbers] = useState([]);
  const [showNew, setShowNew] = useState(false), [form, setForm] = useState(blankForm), [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null), [selected, setSelected] = useState(null), [selectedLoading, setSelectedLoading] = useState(false);
  const [checkoutFor, setCheckoutFor] = useState(null), [checkoutForm, setCheckoutForm] = useState(blankCheckout), [checkingOut, setCheckingOut] = useState(false);
  // NEXUS_CLASS_RECURRING_SCHEDULE_V1
  const [templates, setTemplates] = useState([]), [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false), [templateForm, setTemplateForm] = useState(blankTemplate), [creatingTemplate, setCreatingTemplate] = useState(false);

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

  // NEXUS_CLASS_RECURRING_SCHEDULE_V1
  const loadTemplates = useCallback(async () => {
    if (!organizationId) return;
    setLoadingTemplates(true);
    try {
      const r = await classScheduleTemplateAPI.list({ organization_id: organizationId });
      setTemplates(r.data || []);
    } catch (error) {
      toast.error('No fue posible cargar los horarios recurrentes');
    } finally {
      setLoadingTemplates(false);
    }
  }, [organizationId]);
  useEffect(() => { if (tab === 'recurring') loadTemplates(); }, [tab, loadTemplates]);

  const toggleTemplateDay = (day) => {
    setTemplateForm(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day) ? prev.days_of_week.filter(d => d !== day) : [...prev.days_of_week, day].sort(),
    }));
  };

  const createTemplate = async (e) => {
    e.preventDefault();
    if (!templateForm.service_id || !templateForm.barber_id || !templateForm.days_of_week.length || !templateForm.time || !templateForm.start_date) return;
    setCreatingTemplate(true);
    try {
      const payload = {
        ...templateForm,
        capacity: templateForm.capacity ? Number(templateForm.capacity) : undefined,
        substitute_barber_id: templateForm.substitute_barber_id || undefined,
        end_date: templateForm.end_date || undefined,
      };
      const r = await classScheduleTemplateAPI.create(payload);
      toast.success(`Horario recurrente creado · ${r.data.sessions_created} clase(s) generada(s)`);
      setShowNewTemplate(false);
      setTemplateForm(blankTemplate);
      await Promise.all([loadTemplates(), load()]);
    } catch (error) {
      toast.error(detail(error, 'No fue posible crear el horario recurrente'));
    } finally {
      setCreatingTemplate(false);
    }
  };

  const togglePauseTemplate = async (tpl) => {
    try {
      await (tpl.active ? classScheduleTemplateAPI.pause(tpl.template_id) : classScheduleTemplateAPI.resume(tpl.template_id));
      toast.success(tpl.active ? 'Horario pausado' : 'Horario reanudado');
      await loadTemplates();
    } catch (error) {
      toast.error(detail(error, 'No fue posible actualizar el horario'));
    }
  };

  const deleteTemplate = async (tpl) => {
    if (!window.confirm('¿Eliminar este horario recurrente? Se cancelarán las clases futuras ya generadas (los clientes inscritos serán notificados).')) return;
    try {
      const r = await classScheduleTemplateAPI.delete(tpl.template_id);
      toast.success(`Horario eliminado · ${r.data.future_sessions_cancelled} clase(s) cancelada(s)`);
      await Promise.all([loadTemplates(), load()]);
    } catch (error) {
      toast.error(detail(error, 'No fue posible eliminar el horario'));
    }
  };

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
          actions={groupServices.length > 0 ? (
            tab === 'calendar'
              ? <ActionButton icon={Plus} onClick={() => setShowNew(true)}>Agendar clase</ActionButton>
              : <ActionButton icon={Plus} onClick={() => setShowNewTemplate(true)}>Nuevo horario recurrente</ActionButton>
          ) : null}
        />

        {groupServices.length > 0 && (
          <div className="flex gap-2 p-1 bg-[var(--app-surface-solid)] rounded-xl border border-[var(--app-border)] w-fit">
            <button onClick={() => setTab('calendar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'calendar' ? 'bg-[var(--app-primary)] text-white' : 'text-[var(--app-text-secondary)]'}`}>Calendario</button>
            <button onClick={() => setTab('recurring')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === 'recurring' ? 'bg-[var(--app-primary)] text-white' : 'text-[var(--app-text-secondary)]'}`}><Repeat size={14} />Horarios recurrentes</button>
          </div>
        )}

        {groupServices.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin servicios grupales todavía"
            description="Crea un servicio y márcalo como 'Grupal (clase)' en Servicios antes de poder agendar una clase aquí."
            action={<ActionButton variant="secondary" onClick={() => navigate(`/manager/services${organizationId ? `?org_id=${organizationId}` : ''}`)}>Ir a Servicios</ActionButton>}
          />
        ) : tab === 'calendar' ? (
          loading ? (
            <LoadingState label="Cargando clases" />
          ) : upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Sin clases agendadas" description="Agenda tu primera clase, o crea un horario recurrente para que se generen solas." action={<ActionButton icon={Plus} onClick={() => setShowNew(true)}>Agendar clase</ActionButton>} />
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
                        <div className="flex items-center gap-1.5">
                          <p className="text-[var(--app-text-primary)] font-medium">{svc?.name || 'Servicio'}</p>
                          {session.template_id && <Repeat size={12} className="text-[var(--app-text-secondary)]" />}
                        </div>
                        <p className="text-sm text-[var(--app-text-secondary)]">
                          {instructor?.display_name || instructor?.name || 'Instructor'}
                          {session.substitute_applied && <span className="text-orange-400"> (sustituto)</span>}
                        </p>
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
          )
        ) : loadingTemplates ? (
          <LoadingState label="Cargando horarios recurrentes" />
        ) : templates.length === 0 ? (
          <EmptyState icon={Repeat} title="Sin horarios recurrentes" description="Crea un patrón semanal (ej. martes y jueves 6pm) y las clases se generan solas hacia adelante." action={<ActionButton icon={Plus} onClick={() => setShowNewTemplate(true)}>Nuevo horario recurrente</ActionButton>} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {templates.map(tpl => {
              const svc = serviceById(tpl.service_id);
              const instructor = barberById(tpl.barber_id);
              const substitute = tpl.substitute_barber_id ? barberById(tpl.substitute_barber_id) : null;
              return (
                <div key={tpl.template_id} className="p-5 rounded-2xl bg-white/3 border border-[var(--app-border)]">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[var(--app-text-primary)] font-medium">{svc?.name || 'Servicio'}</p>
                      <p className="text-sm text-[var(--app-text-secondary)]">{instructor?.display_name || instructor?.name || 'Instructor'}{substitute && ` · sustituto: ${substitute.display_name || substitute.name}`}</p>
                    </div>
                    <StatusBadge tone={tpl.active ? 'success' : 'neutral'}>{tpl.active ? 'Activo' : 'Pausado'}</StatusBadge>
                  </div>
                  <p className="text-sm text-[var(--app-text-secondary)] mb-3">
                    {WEEKDAYS.filter(([d]) => tpl.days_of_week.includes(d)).map(([, l]) => l).join(', ')} · {tpl.time} · {tpl.capacity} cupos
                  </p>
                  <div className="flex items-center gap-2">
                    <ActionButton variant="secondary" icon={tpl.active ? Pause : Play} onClick={() => togglePauseTemplate(tpl)}>{tpl.active ? 'Pausar' : 'Reanudar'}</ActionButton>
                    <ActionButton variant="destructive" icon={Trash2} onClick={() => deleteTemplate(tpl)}>Eliminar</ActionButton>
                  </div>
                </div>
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

        {/* NEXUS_CLASS_RECURRING_SCHEDULE_V1 */}
        {showNewTemplate && (
          <AccessibleModal open={showNewTemplate} onClose={() => !creatingTemplate && setShowNewTemplate(false)} labelledBy="template-new-title" describedBy="template-new-description" panelClassName="nexus-accessible-modal-panel">
            <h2 id="template-new-title">Nuevo horario recurrente</h2>
            <p id="template-new-description">Elige los días de la semana y la hora -- las clases se generan solas hacia adelante (próximos 30 días).</p>
            <form className="nexus-guided-form mt-4" onSubmit={createTemplate}>
              <label className="nexus-field-wide"><FieldGuide label="Servicio grupal" required /><select value={templateForm.service_id} onChange={e => setTemplateForm({ ...templateForm, service_id: e.target.value, barber_id: '', substitute_barber_id: '' })} required><option value="">Selecciona un servicio</option>{groupServices.map(s => <option key={s.service_id} value={s.service_id}>{s.name} ({s.group_capacity} cupos)</option>)}</select></label>
              <label><FieldGuide label="Instructor" required /><select value={templateForm.barber_id} onChange={e => setTemplateForm({ ...templateForm, barber_id: e.target.value })} required disabled={!templateForm.service_id}><option value="">Selecciona un instructor</option>{barbers.filter(b => { const ids = b.service_ids || []; return !ids.length || ids.includes(templateForm.service_id); }).map(b => <option key={b.barber_id} value={b.barber_id}>{b.display_name || b.name}</option>)}</select></label>
              <label><FieldGuide label="Instructor sustituto" hint="Se usa si el principal tiene un bloqueo ese día" /><select value={templateForm.substitute_barber_id} onChange={e => setTemplateForm({ ...templateForm, substitute_barber_id: e.target.value })} disabled={!templateForm.service_id}><option value="">Sin sustituto</option>{barbers.filter(b => b.barber_id !== templateForm.barber_id && (!(b.service_ids || []).length || (b.service_ids || []).includes(templateForm.service_id))).map(b => <option key={b.barber_id} value={b.barber_id}>{b.display_name || b.name}</option>)}</select></label>
              <div className="nexus-field-wide">
                <FieldGuide label="Días de la semana" required />
                <div className="flex gap-2 mt-1">
                  {WEEKDAYS.map(([d, l]) => (
                    <button key={d} type="button" onClick={() => toggleTemplateDay(d)} className={`w-10 h-10 rounded-lg border text-sm font-medium transition-all ${templateForm.days_of_week.includes(d) ? 'bg-[var(--app-primary)]/20 border-[var(--app-primary)] text-[var(--app-text-primary)]' : 'border-[var(--app-border)] text-[var(--app-text-secondary)]'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <label><FieldGuide label="Hora" required /><input type="time" value={templateForm.time} onChange={e => setTemplateForm({ ...templateForm, time: e.target.value })} required /></label>
              <label><FieldGuide label="Cupos" hint="Vacío = usa el de Servicios" /><input type="number" min="2" value={templateForm.capacity} onChange={e => setTemplateForm({ ...templateForm, capacity: e.target.value })} /></label>
              <label><FieldGuide label="Desde" required /><input type="date" min={today} value={templateForm.start_date} onChange={e => setTemplateForm({ ...templateForm, start_date: e.target.value })} required /></label>
              <label><FieldGuide label="Hasta" hint="Vacío = indefinido" /><input type="date" min={templateForm.start_date || today} value={templateForm.end_date} onChange={e => setTemplateForm({ ...templateForm, end_date: e.target.value })} /></label>
              <div className="nexus-account-actions mt-2"><ActionButton type="button" variant="secondary" onClick={() => setShowNewTemplate(false)} disabled={creatingTemplate}>Cancelar</ActionButton><ActionButton type="submit" icon={Plus} loading={creatingTemplate}>Crear horario</ActionButton></div>
            </form>
          </AccessibleModal>
        )}
      </MotionPage>
    </AdminShell>
  );
}
