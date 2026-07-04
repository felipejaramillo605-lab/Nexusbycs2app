import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, Filter, ArrowLeft, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TableSkeleton } from '../components/ui/skeleton';
import { authAPI } from '../api';

const ITEMS_PER_PAGE = 10;

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

  // Fetch appointments with React Query
  const { data: appointments = [], isLoading, error } = useQuery({
    queryKey: ['appointments', organizationId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (organizationId) params.append('organization_id', organizationId);
      
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/appointments?${params}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to fetch appointments');
      return response.json();
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    enabled: !!organizationId,
  });

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

  // Filter and sort appointments
  const filteredAppointments = useMemo(() => {
    let filtered = [...appointments];
    
    // Filter by status
    if (filters.status !== 'all') {
      filtered = filtered.filter(apt => apt.status === filters.status);
    }
    
    // Filter by date range
    if (filters.startDate) {
      filtered = filtered.filter(apt => apt.date >= filters.startDate);
    }
    if (filters.endDate) {
      filtered = filtered.filter(apt => apt.date <= filters.endDate);
    }
    
    // Sort by date (newest first)
    filtered.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.time.localeCompare(a.time);
    });
    
    return filtered;
  }, [appointments, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredAppointments.length / ITEMS_PER_PAGE);
  const paginatedAppointments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAppointments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAppointments, currentPage]);

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
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-red-400">Error al cargar citas: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000]">
      {/* Navigation Bar */}
      <nav className="backdrop-blur-xl bg-white/3 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} strokeWidth={1.5} />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Historial de Citas
              </h1>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Calendar size={16} />
              <span>{filteredAppointments.length} citas</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Filters */}
        <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={20} className="text-[#0A84FF]" />
            <h2 className="text-lg font-medium text-white">Filtros</h2>
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
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
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
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
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
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
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
        <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={10} columns={6} />
            </div>
          ) : paginatedAppointments.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400">No se encontraron citas</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
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
                    {paginatedAppointments.map((apt) => (
                      <tr key={apt.appointment_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-white font-medium">{apt.date}</div>
                          <div className="text-sm text-zinc-400">{apt.time}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-white">{apt.customer_name}</div>
                          <div className="text-sm text-zinc-400">{apt.customer_phone}</div>
                        </td>
                        <td className="px-6 py-4 text-white">{apt.service_name}</td>
                        <td className="px-6 py-4 text-white">{apt.barber_name}</td>
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
                                <button
                                  onClick={() => handleStatusUpdate(apt.appointment_id, 'completed')}
                                  disabled={updateStatusMutation.isPending}
                                  className="p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Marcar como completada"
                                >
                                  {updateStatusMutation.isPending ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <CheckCircle size={16} />
                                  )}
                                </button>
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
                {paginatedAppointments.map((apt) => (
                  <div key={apt.appointment_id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-white font-medium">{apt.customer_name}</div>
                        <div className="text-sm text-zinc-400">{apt.date} · {apt.time}</div>
                      </div>
                      {getStatusBadge(apt.status)}
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Servicio:</span>
                        <span className="text-white">{apt.service_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Barbero:</span>
                        <span className="text-white">{apt.barber_name}</span>
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
                        <button
                          onClick={() => handleStatusUpdate(apt.appointment_id, 'completed')}
                          disabled={updateStatusMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 transition-all text-sm disabled:opacity-50"
                        >
                          {updateStatusMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <>
                              <CheckCircle size={16} />
                              Completar
                            </>
                          )}
                        </button>
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
                <div className="border-t border-white/10 p-4 flex items-center justify-between">
                  <div className="text-sm text-zinc-400">
                    Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAppointments.length)} de {filteredAppointments.length}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    
                    <span className="text-sm text-zinc-400">
                      Página {currentPage} de {totalPages}
                    </span>
                    
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppointmentsHistory;
