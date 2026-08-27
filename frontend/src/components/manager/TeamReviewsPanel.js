// NEXUS_TEAM_REVIEWS_V1
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, AlertTriangle, BarChart3, RefreshCw, MessageSquare } from 'lucide-react';
import { api } from '../../api';

const LOW_RATING_THRESHOLD = 3.5;

function StarMeter({ value, size = 16 }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="relative inline-flex" aria-label={`${value} de 5`}>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} className="text-zinc-600" strokeWidth={1.5} />
        ))}
      </div>
      <div className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ width: `${pct}%` }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} className="text-amber-400 fill-amber-400 shrink-0" strokeWidth={1.5} />
        ))}
      </div>
    </div>
  );
}

export default function TeamReviewsPanel({ organizationId }) {
  const navigate = useNavigate();
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/organizations/${organizationId}/reviews/team-summary`);
      setTeam(Array.isArray(res.data?.team) ? res.data.team : []);
    } catch (err) {
      console.error('[TeamReviewsPanel] load failed', { status: err.response?.status });
      setError('No se pudieron cargar las reseñas del equipo.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-12 text-center text-zinc-400">
        Cargando reseñas...
      </div>
    );
  }

  if (error) {
    return (
      <div className="backdrop-blur-xl bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
        <p className="text-red-200 mb-4">{error}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-[var(--app-border)] rounded-lg text-[var(--app-text-primary)] transition-all text-sm"
        >
          <RefreshCw size={16} strokeWidth={1.5} /> Reintentar
        </button>
      </div>
    );
  }

  if (team.length === 0) {
    return (
      <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-12 text-center">
        <MessageSquare size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
        <p className="text-zinc-400 mb-2">Aún no hay reseñas internas del equipo</p>
        <p className="text-zinc-500 text-sm">
          Las reseñas aparecen cuando los clientes califican a los profesionales tras su cita.
        </p>
      </div>
    );
  }

  const totalReviews = team.reduce((sum, r) => sum + (r.total_reviews || 0), 0);
  const orgAverage =
    totalReviews > 0
      ? team.reduce((sum, r) => sum + (r.average_rating || 0) * (r.total_reviews || 0), 0) / totalReviews
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl px-5 py-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Promedio de la organización</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-light text-[var(--app-text-primary)]">{orgAverage.toFixed(2)}</span>
            <StarMeter value={orgAverage} />
            <span className="text-sm text-zinc-500">{totalReviews} reseñas</span>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-[var(--app-border)] rounded-xl text-zinc-300 hover:text-[var(--app-text-primary)] transition-all text-sm"
        >
          <RefreshCw size={16} strokeWidth={1.5} /> Actualizar
        </button>
      </div>

      {/* Mobile: tarjetas apiladas */}
      <ul className="space-y-3 sm:hidden">
        {team.map((row, index) => {
          const isLow = (row.average_rating || 0) < LOW_RATING_THRESHOLD;
          return (
            <li
              key={row.barber_id}
              className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-zinc-500 text-sm">{index + 1}.</span>
                    <span className="text-[var(--app-text-primary)] font-medium truncate">
                      {row.barber_name || 'Profesional'}
                    </span>
                    {isLow && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <AlertTriangle size={11} strokeWidth={2} /> Baja
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StarMeter value={row.average_rating || 0} size={14} />
                    <span className={isLow ? 'text-amber-300 text-sm' : 'text-zinc-300 text-sm'}>
                      {(row.average_rating || 0).toFixed(2)}
                    </span>
                    <span className="text-zinc-500 text-xs">· {row.total_reviews || 0} reseñas</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  navigate(`/manager/barbers/${row.barber_id}/metrics?org_id=${organizationId}`)
                }
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-purple-300 hover:text-purple-200 transition-all text-xs"
              >
                <BarChart3 size={14} strokeWidth={1.5} /> Ver métricas
              </button>
            </li>
          );
        })}
      </ul>

      {/* Desktop: tabla */}
      <div className="hidden sm:block backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-[var(--app-border)]">
                <th className="px-4 py-3 font-medium w-12">#</th>
                <th className="px-4 py-3 font-medium">Profesional</th>
                <th className="px-4 py-3 font-medium">Calificación</th>
                <th className="px-4 py-3 font-medium text-right">Reseñas</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {team.map((row, index) => {
                const isLow = (row.average_rating || 0) < LOW_RATING_THRESHOLD;
                return (
                  <tr
                    key={row.barber_id}
                    className="border-b border-[var(--app-border)] last:border-0 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3 text-zinc-500">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--app-text-primary)] font-medium">
                          {row.barber_name || 'Profesional'}
                        </span>
                        {isLow && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <AlertTriangle size={11} strokeWidth={2} /> Baja
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StarMeter value={row.average_rating || 0} size={14} />
                        <span className={isLow ? 'text-amber-300' : 'text-zinc-300'}>
                          {(row.average_rating || 0).toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">{row.total_reviews || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          navigate(
                            `/manager/barbers/${row.barber_id}/metrics?org_id=${organizationId}`
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-purple-300 hover:text-purple-200 transition-all text-xs"
                      >
                        <BarChart3 size={14} strokeWidth={1.5} /> Ver métricas
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
