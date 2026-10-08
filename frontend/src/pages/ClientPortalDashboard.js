import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  User,
  LogOut,
  Lock,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Star,
  Gift,
  Users,
  CreditCard
} from 'lucide-react';
import ReviewModal from '../components/ReviewModal';
import { useClientDashboard } from '../hooks/useClientDashboard';
import { bookingWindowNotice, formatOpensOn } from '../lib/bookingWindow';

import { usePortalT } from '../lib/portalI18n';
import MessagingPreference from '../components/MessagingPreference';
export default function ClientPortalDashboard() {
  const { t } = usePortalT();
  const navigate = useNavigate();
  const {
    orgId,
    clientData,
    loyalty,
    pendingReviews,
    setPendingReviews,
    googleReview,
    appointments,
    loading,
    showChangePinModal,
    setShowChangePinModal,
    showDeleteModal,
    setShowDeleteModal,
    currentPin,
    setCurrentPin,
    newPin,
    setNewPin,
    confirmNewPin,
    setConfirmNewPin,
    changingPin,
    deleteConfirmText,
    setDeleteConfirmText,
    deletePin,
    setDeletePin,
    deleting,
    classSessions,
    membership,
    loadingClasses,
    bookingSessionId,
    pickingSpotFor,
    setPickingSpotFor,
    handleBookClass,
    handleCancelClassBooking,
    handleJoinWaitlist,
    handleLeaveWaitlist,
    handleLogout,
    handleCancelAppointment,
    handleChangePin,
    handleDeleteAccount,
  } = useClientDashboard();
  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs">
            <CheckCircle2 size={12} />
           {t('Confirmada')}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs">
            <CheckCircle2 size={12} />
           {t('Completada')}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs">
            <XCircle size={12} />
           {t('Cancelada')}
          </span>
        );
      case 'no-show':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-xs">
            <AlertCircle size={12} />
           {t('No asistió')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-500/20 text-zinc-400 text-xs">
            {status}
          </span>
        );
    }
  };

  const isPastAppointment = (date, time) => {
    const appointmentDateTime = new Date(`${date}T${time}`);
    return appointmentDateTime < new Date();
  };

  const canCancelAppointment = (status, date, time) => {
    return status === 'confirmed' && !isPastAppointment(date, time);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 size={48} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  const upcomingAppointments = appointments.filter(
    apt => apt.status === 'confirmed' && !isPastAppointment(apt.date, apt.time)
  );
  
  const pastAppointments = appointments.filter(
    apt => apt.status !== 'confirmed' || isPastAppointment(apt.date, apt.time)
  );

  return (
    <div className="min-h-screen bg-black">
      {pendingReviews[0] && (
        <ReviewModal
          appointment={pendingReviews[0]}
          googleReview={googleReview}
          onSubmitted={(id) => setPendingReviews((prev) => prev.filter((p) => p.appointment_id !== id))}
          onSkip={() => setPendingReviews((prev) => prev.slice(1))}
        />
      )}
      {/* Header */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link 
            to={`/book/${orgId}`}
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-4 text-sm"
          >
            <ArrowLeft size={16} />
           {t('Volver a reservar')}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
               {t('Hola,')} {clientData?.name}
              </h1>
              <p className="text-sm text-zinc-400">{clientData?.phone}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-zinc-300 transition-colors"
            >
              <LogOut size={16} />
             {t('Salir')}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* NEXUS_LOYALTY_PROGRAM_V1 — Card de puntos con barra de progreso */}
        {loyalty?.enabled && (
          <div data-testid="loyalty-card" className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                <Star size={22} className="text-amber-400" fill="currentColor" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">{t('Tus puntos de lealtad')}</h2>
                <p className="text-xs text-zinc-400">
                  {loyalty.points_per_visit > 0 ? t('Ganas {0} puntos por cada visita', loyalty.points_per_visit) : t('Programa de fidelización')}
                </p>
              </div>
              <div data-testid="loyalty-points-value" className="text-3xl font-bold text-amber-400">
                {loyalty.points}
              </div>
            </div>
            {loyalty.reward_threshold > 0 && (
              <>
                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mb-3">
                  <div
                    data-testid="loyalty-progress-bar"
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                    style={{ width: `${loyalty.progress_percent || 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">
                    {loyalty.points_to_next_reward > 0
                      ? t('Te faltan {0} puntos para tu próxima recompensa', loyalty.points_to_next_reward)
                      : t('¡Ya puedes canjear tu recompensa!')}
                  </span>
                  <span className="text-amber-400 font-medium">{loyalty.progress_percent}%</span>
                </div>
                {loyalty.reward_description && (
                  <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2">
                    <Gift size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-zinc-300">{loyalty.reward_description}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate(`/book/${orgId}`)}
            className="flex items-center gap-3 p-4 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl transition-all group"
          >
            <Plus size={20} className="text-white" />
            <div className="text-left">
              <div className="font-medium text-white">{t('Nueva Cita')}</div>
              <div className="text-xs text-blue-100">{t('Reservar ahora')}</div>
            </div>
          </button>

          <button
            onClick={() => setShowChangePinModal(true)}
            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
          >
            <Lock size={20} className="text-zinc-400" />
            <div className="text-left">
              <div className="font-medium text-white">{t('Cambiar PIN')}</div>
              <div className="text-xs text-zinc-400">{t('Actualizar seguridad')}</div>
            </div>
          </button>

          <MessagingPreference />

          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-3 p-4 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-xl transition-all group"
          >
            <Trash2 size={20} className="text-zinc-400 group-hover:text-red-400" />
            <div className="text-left">
              <div className="font-medium text-white group-hover:text-red-400">{t('Eliminar Cuenta')}</div>
              <div className="text-xs text-zinc-400 group-hover:text-red-400/70">{t('Permanente')}</div>
            </div>
          </button>
        </div>

        {/* NEXUS_GROUP_SERVICES_MEMBERSHIPS_V1: membresía + clases grupales */}
        {membership?.membership && (
          <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center">
                <CreditCard size={22} className="text-violet-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">{membership.plan?.name || t('Tu membresía')}</h2>
                <p className="text-xs text-zinc-400">
                  {membership.membership.status === 'active'
                    ? `Activa · vence ${membership.membership.period_end}`
                    : t('Vencida el {0} · puedes seguir asistiendo pagando el día, o renovar', membership.membership.period_end)}
                </p>
              </div>
            </div>
            {membership.benefits?.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-zinc-300">
                {membership.benefits.map(b => (
                  <li key={b.service_id} className="flex items-center justify-between">
                    <span>{b.service_name}</span>
                    <span className="text-zinc-400">{b.monthly_limit ? `${b.remaining}/${b.monthly_limit} restantes` : t('Ilimitado')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Users size={20} className="text-violet-400" />
           {t('Clases grupales')}
          </h2>
          {loadingClasses ? (
            <div className="p-8 bg-white/5 border border-white/10 rounded-xl text-center text-zinc-400">{t('Cargando clases...')}</div>
          ) : classSessions.length === 0 ? (
            <div className="p-8 bg-white/5 border border-white/10 rounded-xl text-center">
              <Users size={32} className="text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">{t('No hay clases grupales disponibles por ahora')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {classSessions.map(session => (
                <div key={session.class_session_id} className="overflow-hidden bg-white/5 border border-white/10 rounded-xl">
                  {session.service_presentation?.cover_image_url && (
                    <img
                      src={session.service_presentation.cover_image_url}
                      alt={session.service_presentation.image_alt || session.service_name}
                      className="w-full aspect-[4/3] object-cover"
                      style={{ objectPosition: session.service_presentation.image_focal_point || 'center' }}
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-white">{session.service_name}</h3>
                      <p className="text-sm text-zinc-400">{t('Con')} {session.barber_name}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 text-zinc-300 text-xs">
                      {session.spots_available} {t('cupos')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-400 mb-3">
                    <span className="flex items-center gap-1"><Calendar size={14} />{session.date}</span>
                    <span className="flex items-center gap-1"><Clock size={14} />{session.time}</span>
                    {session.service_presentation?.duration && <span>{session.service_presentation.duration} {t('min')}</span>}
                  </div>
                  {session.service_presentation?.short_description && <p className="text-sm text-zinc-300 mb-3">{session.service_presentation.short_description}</p>}
                  <p className="text-xs text-zinc-500 mb-3">
                    {session.membership_covers
                      ? (session.membership_remaining != null ? t('Cubierto por tu plan · {0} restantes este mes', session.membership_remaining) : t('Cubierto por tu plan'))
                      : t('Sin membresía: ${0} pagando el día', session.drop_in_price)}
                  </p>
                  {session.already_booked ? (
                    <>
                      {/* NEXUS_CLASS_BOOKING_CONFIRMATION_V1: the client's own
                          spot/code were never surfaced here before -- this is
                          the "preview my reservation" the product asked for,
                          shown every time the portal loads, not just once at
                          booking time. */}
                      <div className="mb-2 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 space-y-0.5">
                        <p className="font-medium">{t('Cupo confirmado')}{session.my_spot_label ? ` · ${session.my_spot_label}` : ''}</p>
                        {session.my_confirmation_code && <p className="text-emerald-400/80">{t('Código de confirmación:')} {session.my_confirmation_code}</p>}
                      </div>
                      <button
                        onClick={() => handleCancelClassBooking(session.my_class_booking_id)}
                        className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
                      >
                       {t('Cancelar cupo')}
                      </button>
                    </>
                  ) : session.already_waitlisted ? (
                    <button
                      onClick={() => handleLeaveWaitlist(session.my_waitlist_id)}
                      className="w-full py-2 bg-white/10 hover:bg-white/15 border border-white/20 text-zinc-300 rounded-lg text-sm transition-colors"
                    >
                     {t('En lista de espera · salir')}
                    </button>
                  ) : session.open_for_booking === false ? (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 space-y-0.5" data-testid="portal-class-not-open">
                      <p className="font-medium">{t('Las reservas abren el')} {formatOpensOn(session.booking_opens_on)}</p>
                      {session.booking_window_days ? <p>{bookingWindowNotice(session.booking_window_days)}</p> : null}
                    </div>
                  ) : session.spots_available <= 0 ? (
                    <button
                      onClick={() => handleJoinWaitlist(session.class_session_id)}
                      disabled={bookingSessionId === session.class_session_id}
                      className="w-full py-2 bg-white/10 hover:bg-white/15 border border-white/20 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {bookingSessionId === session.class_session_id ? t('Uniéndote...') : t('Unirme a la lista de espera')}
                    </button>
                  ) : session.spot_layout?.length && pickingSpotFor === session.class_session_id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {session.spot_layout.map(spot => {
                          const taken = (session.occupied_spots || []).includes(spot);
                          return (
                            <button
                              key={spot}
                              onClick={() => !taken && handleBookClass(session.class_session_id, spot)}
                              disabled={taken || bookingSessionId === session.class_session_id}
                              className={`py-2 px-1 rounded-lg text-xs transition-colors ${taken ? 'bg-white/5 text-zinc-600 cursor-not-allowed' : 'bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300'}`}
                            >
                              {spot}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => setPickingSpotFor(null)} className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300">{t('Cancelar')}</button>
                    </div>
                  ) : session.spot_layout?.length ? (
                    <button
                      onClick={() => setPickingSpotFor(session.class_session_id)}
                      className="w-full py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 rounded-lg text-sm transition-colors"
                    >
                     {t('Elegir spot')}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBookClass(session.class_session_id)}
                      disabled={bookingSessionId === session.class_session_id}
                      className="w-full py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-300 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {bookingSessionId === session.class_session_id ? t('Reservando...') : t('Reservar cupo')}
                    </button>
                  )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Appointments */}
        {upcomingAppointments.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar size={20} className="text-blue-400" />
             {t('Próximas Citas')}
            </h2>
            <div className="space-y-3">
              {upcomingAppointments.map((apt) => (
                <div
                  key={apt.appointment_id}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-white mb-1">{apt.service_name}</h3>
                      <p className="text-sm text-zinc-400">{t('Con')} {apt.barber_name}</p>
                    </div>
                    {getStatusBadge(apt.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-400 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {apt.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {apt.time}
                    </span>
                  </div>
                  {canCancelAppointment(apt.status, apt.date, apt.time) && (
                    <button
                      onClick={() => handleCancelAppointment(apt.appointment_id)}
                      className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
                    >
                     {t('Cancelar cita')}
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/portal/${orgId}/reschedule/${apt.appointment_id}`)}
                    className="w-full mt-2 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg text-sm transition-colors"
                  >
                   {t('Reprogramar cita')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past Appointments */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={20} className="text-zinc-400" />
           {t('Historial (')}{pastAppointments.length})
          </h2>
          {pastAppointments.length > 0 ? (
            <div className="space-y-3">
              {pastAppointments.map((apt) => (
                <div
                  key={apt.appointment_id}
                  className="p-4 bg-white/5 border border-white/10 rounded-xl opacity-75"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-white">{apt.service_name}</h3>
                      <p className="text-sm text-zinc-500">{t('Con')} {apt.barber_name}</p>
                    </div>
                    {getStatusBadge(apt.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {apt.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {apt.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 bg-white/5 border border-white/10 rounded-xl text-center">
              <Clock size={32} className="text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">{t('No tienes citas anteriores')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Change PIN Modal */}
      {showChangePinModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">{t('Cambiar PIN')}</h3>
            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                 {t('PIN Actual')}
                </label>
                <input
                  type="password"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                 {t('Nuevo PIN')}
                </label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                 {t('Confirmar Nuevo PIN')}
                </label>
                <input
                  type="password"
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  placeholder="••••"
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePinModal(false);
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmNewPin('');
                  }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-colors"
                >
                 {t('Cancelar')}
                </button>
                <button
                  type="submit"
                  disabled={changingPin}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {changingPin ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                     {t('Actualizando...')}
                    </>
                  ) : (
                    t('Cambiar PIN')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 size={24} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{t('Eliminar Cuenta')}</h3>
                <p className="text-sm text-zinc-400">{t('Esta acción es permanente')}</p>
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-200">
               {t('⚠️ Tu perfil será eliminado, pero tus citas anteriores se mantendrán en el historial del negocio.')}
              </p>
            </div>
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                 {t('PIN actual (4 dígitos)')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength={4}
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 tracking-widest text-center"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                 {t('Escribe')} <span className="text-red-400 font-bold">{t('ELIMINAR')}</span> {t('para confirmar')}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={t('ELIMINAR')}
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText('');
                    setDeletePin('');
                  }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-colors"
                >
                 {t('Cancelar')}
                </button>
                <button
                  type="submit"
                  disabled={deleting || deleteConfirmText !== 'ELIMINAR'}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                     {t('Eliminando...')}
                    </>
                  ) : (
                    t('Eliminar mi cuenta')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
