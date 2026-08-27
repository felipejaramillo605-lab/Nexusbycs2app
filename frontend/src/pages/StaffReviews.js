// NEXUS_STAFF_REVIEWS_V1
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, MessageSquare, TrendingUp, Clock, RefreshCw } from 'lucide-react';
import { barberAPI } from '../api';

function StarDisplay({ rating, size = 16 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  } catch { return ''; }
}

function RatingBar({ value, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-4 text-right text-zinc-400">{value}</span>
      <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-zinc-500 text-xs">{count}</span>
    </div>
  );
}

export default function StaffReviews() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await barberAPI.getMyReviews();
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'No fue posible cargar tus reseñas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const distribution = data?.recent
    ? [5, 4, 3, 2, 1].map(v => ({
        value: v,
        count: data.recent.filter(r => r.rating === v).length
      }))
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/staff/profile')}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-[var(--app-border)] text-zinc-400 hover:text-white transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-white">Mis Reseñas</h1>
          <p className="text-sm text-zinc-400">Calificaciones de tus clientes</p>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <RefreshCw size={28} className="animate-spin mb-3 opacity-40" />
          <p className="text-sm">Cargando reseñas...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="text-red-300 hover:text-white transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary card */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-3xl font-bold text-white">{data.average_rating || '—'}</p>
                <p className="text-sm text-zinc-400 mt-1">Promedio general</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                  <MessageSquare size={14} />
                  <span className="text-sm">{data.total_reviews} reseña{data.total_reviews !== 1 ? 's' : ''}</span>
                </div>
                <StarDisplay rating={Math.round(data.average_rating || 0)} size={18} />
              </div>
            </div>

            {/* Rating distribution */}
            {data.total_reviews > 0 && (
              <div className="space-y-1.5 pt-3 border-t border-zinc-800">
                {distribution.map(d => (
                  <RatingBar key={d.value} value={d.value} count={d.count} total={data.recent.length} />
                ))}
                {data.total_reviews > data.recent.length && (
                  <p className="text-[10px] text-zinc-600 text-right mt-1">
                    Distribución basada en las últimas {data.recent.length} reseñas
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Insight card */}
          {data.total_reviews >= 3 && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
              data.average_rating >= 4 ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : data.average_rating >= 3 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              <TrendingUp size={16} className="shrink-0" />
              <span>
                {data.average_rating >= 4.5 ? 'Excelente desempeño. Tus clientes valoran tu servicio.'
                  : data.average_rating >= 4 ? 'Buen desempeño. Sigue así para mantener tus calificaciones.'
                  : data.average_rating >= 3 ? 'Desempeño aceptable. Revisa los comentarios para mejorar.'
                  : 'Tu calificación necesita atención. Lee los comentarios de tus clientes.'}
              </span>
            </div>
          )}

          {/* Reviews list */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Clock size={14} />
              Reseñas recientes
            </h2>

            {data.recent.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Star size={32} className="mx-auto mb-2 text-zinc-700" />
                <p className="text-sm text-zinc-500">Aún no tienes reseñas</p>
                <p className="text-xs text-zinc-600 mt-1">Las reseñas aparecerán aquí después de cada servicio evaluado</p>
              </div>
            ) : (
              data.recent.map((review, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <StarDisplay rating={review.rating} size={14} />
                    <div className="flex items-center gap-1 text-zinc-600">
                      <Clock size={11} />
                      <span className="text-[11px]" title={formatDate(review.created_at)}>
                        {timeAgo(review.created_at)}
                      </span>
                    </div>
                  </div>
                  {review.comment ? (
                    <p className="text-sm text-zinc-300 leading-relaxed">"{review.comment}"</p>
                  ) : (
                    <p className="text-sm text-zinc-600 italic">Sin comentario</p>
                  )}
                </div>
              ))
            )}
          </div>

          {data.total_reviews > data.recent.length && (
            <p className="text-center text-xs text-zinc-600">
              Mostrando {data.recent.length} de {data.total_reviews} reseñas
            </p>
          )}
        </>
      )}
    </div>
  );
}
