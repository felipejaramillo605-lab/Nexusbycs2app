import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, Filter, ArrowLeft, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, Loader2, CreditCard, X } from 'lucide-react';
import { toast } from 'sonner';
import { TableSkeleton } from '../components/ui/skeleton';
import { appointmentAPI } from '../api';
import { AccessibleModal } from '../components/design';

const ITEMS_PER_PAGE = 10;
// NEXUS_FRONTEND_PAGINATION_4D2_V2

const AppointmentsHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  const organizationId = searchParams.get('org_id') || user?.organization_id;
  
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    status: 'all',
    startDate: '',
    endDate: ''
  });
  // NEXUS_CHECKOUT_UI_V1
  const [checkoutAppointment, setCheckoutAppointment] = useState(null);
  const [checkoutForm, setCheckoutForm] = useState({ discount_amount: 0, tip_amount: 0, payment_method: 'cash', notes: '' });

  // Fetch appointments with server-side pagination
  const { data: appointmentPage, isLoading, error } = useQuery({
    queryKey: ['appointments', organizationId, filters, currentPage],
    queryFn: async () => {
      const params = { organization_id: organizationId, page: currentPage, page_size: ITEMS_PER_PAGE, ...(filters.status !== 'all' ? { status: filters.status } : {}), ...(filters.startDate ? { start_date: filters.startDate } : {}), ...(filters.endDate ? { end_date: filters.endDate } : {}) };
      const response = await appointmentAPI.getAll(params);
      return response.data;
    },
    staleTime: 1000 * 60 * 2,
    enabled: !!organizationId,
    placeholderData: previousData => previousData,
  });

  const appointments = appointmentPage?.items || [];
  const totalAppointments = appointmentPage?.total || 0;
  const totalPages = appointmentPage?.total_pages || 0;

  // Mutation for updating appointment status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ appointmentId, status }) => {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/appointments/${appointmentId}/status?status=${status}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
      toast.success(`Cita marcada como ${variables.status === 'completed' ? 'completada' : 'cancelada'}`);
    },
    onError: (error) => {
      toast.error('Error al actualizar el estado de la cita');
      console.error(error);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: ({ appointmentId, payload }) => appointmentAPI.checkout(appointmentId, payload),
    onSuccess: (response) => { queryClient.invalidateQueries({ queryKey: ['appointments'] }); queryClient.invalidateQueries({ queryKey: ['statistics'] }); queryClient.invalidateQueries({ queryKey: ['inventory'] }); setCheckoutAppointment(null); const data=response?.data || {}; if (data.inventory_warning) toast.warning(`Cobro completado con ${data.inventory_shortage_count} faltante(s) de inventario`); else toast.success(data.inventory_consumption_status === 'consumed' ? 'Cita cobrada e insumos descontados' : 'Cita completada y cobrada correctamente'); },
    onError: (error) => toast.error(error.response?.data?.detail || 'No fue posible completar el cobro'),
  });
  const openCheckout = (appointment) => { setCheckoutAppointment(appointment); setCheckoutForm({ discount_amount: 0, tip_amount: 0, payment_method: 'cash', notes: '' }); };
  const submitCheckout = () => {
    const discount=Number(checkoutForm.discount_amount)||0, tip=Number(checkoutForm.tip_amount)||0, price=Number(checkoutAppointment?.service_price)||0;
    if (discount < 0 || tip < 0) return toast.error('Descuento y propina no pueden ser negativos');
    if (discount > price) return toast.error('El descuento no puede superar el precio del servicio');
    checkoutMutation.mutate({ appointmentId: checkoutAppointment.appointment_id, payload: { ...checkoutForm, discount_amount: discount, tip_amount: tip, notes: checkoutForm.notes.trim() } });
  };

  const handleStatusUpdate = (appointmentId, newStatus) => {
    updateStatusMutation.mutate({ appointmentId, status: newStatus });
  };

  const getStatusBadge = (status) => {
    const styles = {
      confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    
    const labels = {
      confirmed: 'Confirmada',
      completed: 'Completada',
      cancelled: 'Cancelada',
    };
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.confirmed}`}>
        {labels[status] || status}
      </span>
    );
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (error) {
    return (
      <div className="min-h-screen nexus-screen flex items-center justify-center">
        <div className="text-red-400">Error al cargar citas: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen nexus-screen">
      {/* Navigation Bar */}
      <nav className="backdrop-blur-xl bg-white/3 border-b border-[var(--app-border)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
                className="flex items-center gap-2 text-zinc-400 hover:text-[var(--app-text-primary)] transition-colors"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-[var(--app-text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Historial de Citas
              </h1>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Calendar size={16} />
              <span>{totalAppointments} citas</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Filters */}
        <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-[#0A84FF]" />
            <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Filtros</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Estado</label>
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
              >
                <option value="all">Todas</option>
                <option value="confirmed">Confirmadas</option>
                <option value="completed">Completadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Desde</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => {
                  setFilters({ ...filters, startDate: e.target.value });
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Hasta</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => {
                  setFilters({ ...filters, endDate: e.target.value });
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
              />
            </div>
          </div>

          {/* Reset Filters */}
          {(filters.status !== 'all' || filters.startDate || filters.endDate) && (
            <button
              onClick={() => {
                setFilters({ status: 'all', startDate: '', endDate: '' });
                setCurrentPage(1);
              }}
              className="mt-4 text-sm text-[#0A84FF] hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Table */}
        <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={10} columns={6} />
            </div>
          ) : appointments.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400">No se encontraron citas</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-[var(--app-border)]">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Fecha y Hora</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Cliente</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Concepto</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Barbero</th>
                      <th className="text-right px-6 py-4 text-sm font-medium text-zinc-400">Valor</th>
                      <th className="text-center px-6 py-4 text-sm font-medium text-zinc-400">Estado</th>
                      <th className="text-right px-6 py-4 text-sm font-medium text-zinc-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {appointments.map((apt) => (
                      <tr key={apt.appointment_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-[var(--app-text-primary)] font-medium">{apt.date}</div>
                          <div className="text-sm text-zinc-400">{apt.time}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[var(--app-text-primary)]">{apt.customer_name}</div>
                          <div className="text-sm text-zinc-400">{apt.customer_phone}</div>
                        </td>
                        <td className="px-6 py-4 text-[var(--app-text-primary)]">{apt.service_name}</td>
                        <td className="px-6 py-4 text-[var(--app-text-primary)]">{apt.barber_name}</td>
                        <td className="px-6 py-4 text-right">
                          <div className={`font-medium ${apt.status === 'cancelled' ? 'text-zinc-500 line-through' : 'text-[#0A84FF]'}`}>
                            {formatCurrency(apt.service_price)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {getStatusBadge(apt.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {apt.status === 'confirmed' && (
                              <>
                                <button onClick={() => openCheckout(apt)} disabled={checkoutMutation.isPending} className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 disabled:opacity-50" title="Completar y cobrar"><CreditCard size={16} /></button>
                                <button
                                  onClick={() => handleStatusUpdate(apt.appointment_id, 'cancelled')}
                                  disabled={updateStatusMutation.isPending}
                                  className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Cancelar cita"
                                >
                                  {updateStatusMutation.isPending ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <XCircle size={16} />
                                  )}
                                </button>
                              </>
                            )}
                            {(apt.status === 'completed' || apt.status === 'cancelled') && (
                              <span className="text-xs text-zinc-500">Sin acciones</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-white/5">
                {appointments.map((apt) => (
                  <div key={apt.appointment_id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[var(--app-text-primary)] font-medium">{apt.customer_name}</div>
                        <div className="text-sm text-zinc-400">{apt.date} · {apt.time}</div>
                      </div>
                      {getStatusBadge(apt.status)}
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Servicio:</span>
                        <span className="text-[var(--app-text-primary)]">{apt.service_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Barbero:</span>
                        <span className="text-[var(--app-text-primary)]">{apt.barber_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Valor:</span>
                        <span className={`font-medium ${apt.status === 'cancelled' ? 'text-zinc-500 line-through' : 'text-[#0A84FF]'}`}>
                          {formatCurrency(apt.service_price)}
                        </span>
                      </div>
                    </div>

                    {apt.status === 'confirmed' && (
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => openCheckout(apt)} disabled={checkoutMutation.isPending} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-sm disabled:opacity-50"><CreditCard size={16} />Completar y cobrar</button>
                        <button
                          onClick={() => handleStatusUpdate(apt.appointment_id, 'cancelled')}
                          disabled={updateStatusMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-all text-sm disabled:opacity-50"
                        >
                          {updateStatusMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <>
                              <XCircle size={16} />
                              Cancelar
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-[var(--app-border)] p-4 flex items-center justify-between">
                  <div className="text-sm text-zinc-400">
                    Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalAppointments)} de {totalAppointments}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-[var(--app-text-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    
                    <span className="text-sm text-zinc-400">
                      Página {currentPage} de {totalPages}
                    </span>
                    
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-[var(--app-text-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        {checkoutAppointment && (
          <AccessibleModal open={!!checkoutAppointment} onClose={()=>!checkoutMutation.isPending&&setCheckoutAppointment(null)} labelledBy="checkout-title" describedBy="checkout-description" panelClassName="w-full max-w-xl rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-elevated)] p-6 max-h-[95vh] overflow-y-auto">
              <div className="flex justify-between mb-5"><div><h2 id="checkout-title" className="text-xl text-[var(--app-text-primary)]">Completar y cobrar</h2><p id="checkout-description" className="text-sm text-zinc-400">{checkoutAppointment.service_name} · {checkoutAppointment.barber_name}</p></div><button onClick={() => setCheckoutAppointment(null)} disabled={checkoutMutation.isPending}><X className="text-zinc-400" size={20} /></button></div>
              {(() => { const price=Number(checkoutAppointment.service_price)||0, discount=Number(checkoutForm.discount_amount)||0, tip=Number(checkoutForm.tip_amount)||0, net=Math.max(0,price-discount); return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm bg-white/5 border border-[var(--app-border)] rounded-xl p-4"><span className="text-zinc-400">Precio original</span><span className="text-right text-[var(--app-text-primary)]">{formatCurrency(price)}</span><span className="text-zinc-400">Descuento</span><span className="text-right text-[var(--app-text-primary)]">{formatCurrency(discount)}</span><span className="text-zinc-400">Valor neto</span><span className="text-right text-[var(--app-text-primary)]">{formatCurrency(net)}</span><span className="text-zinc-400">Propina</span><span className="text-right text-[var(--app-text-primary)]">{formatCurrency(tip)}</span><span className="text-[var(--app-text-primary)]">Total recibido</span><span className="text-right text-[#0A84FF]">{formatCurrency(net+tip)}</span></div>
                  <div className="grid sm:grid-cols-2 gap-4"><label className="text-sm text-zinc-400">Descuento<input type="number" min="0" value={checkoutForm.discount_amount} onChange={(e)=>setCheckoutForm({...checkoutForm,discount_amount:e.target.value})} className="mt-2 w-full p-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label><label className="text-sm text-zinc-400">Propina<input type="number" min="0" value={checkoutForm.tip_amount} onChange={(e)=>setCheckoutForm({...checkoutForm,tip_amount:e.target.value})} className="mt-2 w-full p-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label></div>
                  <label className="block text-sm text-zinc-400">Medio de pago<select value={checkoutForm.payment_method} onChange={(e)=>setCheckoutForm({...checkoutForm,payment_method:e.target.value})} className="mt-2 w-full p-3 bg-[#18181b] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="other">Otro</option></select></label>
                  <label className="block text-sm text-zinc-400">Observaciones<textarea rows={3} maxLength={500} value={checkoutForm.notes} onChange={(e)=>setCheckoutForm({...checkoutForm,notes:e.target.value})} className="mt-2 w-full p-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)]" /></label>
                  <p className="text-xs text-zinc-500">La comisión se calcula en el servidor con la regla vigente.</p><div className="flex justify-end gap-3"><button onClick={()=>setCheckoutAppointment(null)} disabled={checkoutMutation.isPending} className="px-4 py-2 text-zinc-300">Cancelar</button><button onClick={submitCheckout} disabled={checkoutMutation.isPending} className="px-4 py-2 rounded-xl bg-green-600 text-[var(--app-text-primary)] disabled:opacity-50">{checkoutMutation.isPending ? 'Procesando...' : 'Confirmar cobro'}</button></div>
                </div>); })()}
            </AccessibleModal>
        )}
        </div>
      </div>
    </div>
  );
};

export default AppointmentsHistory;
