// NEXUS_PROFESSIONAL_METRICS_V1
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star, Calendar, DollarSign, TrendingUp, Clock, Users, Award, BarChart3, FileText, Briefcase, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../api';
import { toast } from 'sonner';

const fmt = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const DAYS_LABELS = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
const PERIOD_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
  { value: 180, label: '6 meses' },
  { value: 365, label: '1 año' },
];

function MetricCard({ icon: Icon, label, value, sub, color = 'text-amber-400', className = '' }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={color} />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function StarDisplay({ rating, size = 16 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(v => (
        <Star key={v} size={size}
          className={v <= Math.round(rating) ? 'text-amber-400' : 'text-zinc-700'}
          fill={v <= Math.round(rating) ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}

function WeeklyChart({ data }) {
  if (!data || data.length === 0) return <p className="text-sm text-zinc-500">Sin datos en este periodo</p>;
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="space-y-2">
      {data.map(w => (
        <div key={w.week} className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 w-20 shrink-0">{w.week}</span>
          <div className="flex-1 h-6 bg-zinc-800 rounded overflow-hidden relative">
            <div
              className="h-full bg-amber-500/30 rounded"
              style={{ width: `${(w.revenue / maxRevenue) * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center px-2 text-xs text-zinc-300">
              {fmt(w.revenue)} · {w.services} serv.
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProfessionalMetrics() {
  const { barberId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orgId = searchParams.get('org_id') || '';
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [contractEditing, setContractEditing] = useState(false);
  const [contractType, setContractType] = useState('commission');
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [savingContract, setSavingContract] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !barberId) return;
    setLoading(true);
    try {
      const res = await api.get(`/organizations/${orgId}/barbers/${barberId}/metrics`, { params: { period_days: period } });
      setMetrics(res.data);
      setContractType(res.data.profile?.contract_type || 'commission');
      setMonthlySalary(res.data.profile?.monthly_salary || 0);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al cargar métricas');
    } finally {
      setLoading(false);
    }
  }, [orgId, barberId, period]);

  useEffect(() => { load(); }, [load]);

  const saveContract = async () => {
    setSavingContract(true);
    try {
      await api.put(`/organizations/${orgId}/barbers/${barberId}/contract`, {
        contract_type: contractType,
        monthly_salary: contractType === 'fixed_salary' ? monthlySalary : 0,
      });
      toast.success('Tipo de contrato actualizado');
      setContractEditing(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al guardar contrato');
    } finally {
      setSavingContract(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-amber-400" size={32} />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <p className="text-zinc-400">No se encontraron métricas para este profesional.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-amber-400 hover:text-amber-300">Volver</button>
      </div>
    );
  }

  const { profile, rating, appointments, financial } = metrics;
  const createdDate = profile.created_at ? new Date(profile.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/D';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-zinc-700" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center border-2 border-zinc-700">
              <span className="text-xl text-amber-400 font-semibold">{(profile.name || '?')[0]}</span>
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-white">{profile.name}</h1>
            <p className="text-sm text-zinc-400">Desde {createdDate} · {profile.hours_per_week}h/semana</p>
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${
              period === opt.value ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'text-zinc-500 border border-zinc-800 hover:border-zinc-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {loading && <Loader2 size={14} className="animate-spin text-zinc-500 ml-2" />}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Star} label="Calificación" value={rating.average ? `${rating.average}/5` : 'N/D'}
          sub={`${rating.total} reseñas totales`} color="text-amber-400" />
        <MetricCard icon={Calendar} label="Servicios" value={appointments.period_completed}
          sub={`${appointments.per_week_avg}/sem · ${appointments.per_month_avg}/mes`} color="text-blue-400" />
        <MetricCard icon={DollarSign} label="Ingresos generados" value={fmt(financial.total_revenue)}
          sub={`Ticket prom: ${fmt(financial.avg_ticket)}`} color="text-green-400" />
        <MetricCard icon={TrendingUp} label="ROI" value={financial.roi > 0 ? `${financial.roi}x` : 'N/D'}
          sub={financial.contract_type === 'fixed_salary' ? 'Ingresos / costo empleador' : 'Ingresos / costo staff'}
          color={financial.roi >= 1.5 ? 'text-green-400' : financial.roi >= 1 ? 'text-amber-400' : 'text-red-400'} />
      </div>

      {/* Schedule & Profile Info */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-blue-400" />
            <h3 className="text-sm font-medium text-white">Horario y disponibilidad</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Jornada</span>
              <span className="text-white">{profile.start_time} - {profile.end_time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Horas/semana</span>
              <span className="text-white">{profile.hours_per_week}h</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-zinc-400">Días</span>
              <div className="flex gap-1">
                {(profile.available_days || []).sort().map(d => (
                  <span key={d} className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs text-zinc-300">{DAYS_LABELS[d]}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Miembro desde</span>
              <span className="text-white">{createdDate}</span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Award size={15} className="text-amber-400" />
            <h3 className="text-sm font-medium text-white">Calificaciones internas</h3>
          </div>
          {rating.total === 0 ? (
            <p className="text-sm text-zinc-500">Sin reseñas aún</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-white">{rating.average}</span>
                <div>
                  <StarDisplay rating={rating.average} />
                  <p className="text-xs text-zinc-500 mt-0.5">{rating.total} reseñas · {rating.period_count} en el periodo</p>
                </div>
              </div>
              {rating.recent.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  {rating.recent.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <StarDisplay rating={r.rating} size={12} />
                      {r.comment && <p className="text-xs text-zinc-400 line-clamp-1">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Appointments breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={15} className="text-blue-400" />
          <h3 className="text-sm font-medium text-white">Citas (historial completo)</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xl font-semibold text-white">{appointments.completed}</p>
            <p className="text-xs text-zinc-500">Completadas</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xl font-semibold text-white">{appointments.cancelled}</p>
            <p className="text-xs text-zinc-500">Canceladas</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xl font-semibold text-white">{appointments.no_show}</p>
            <p className="text-xs text-zinc-500">No asistió</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xl font-semibold text-amber-400">{appointments.completion_rate}%</p>
            <p className="text-xs text-zinc-500">Tasa completadas</p>
          </div>
        </div>
      </div>

      {/* Financial */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <DollarSign size={15} className="text-green-400" />
            <h3 className="text-sm font-medium text-white">Finanzas ({PERIOD_OPTIONS.find(o => o.value === period)?.label})</h3>
          </div>
          <span className="text-xs text-zinc-500">{financial.service_count} servicios</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1">Ingresos generados</p>
            <p className="text-lg font-semibold text-white">{fmt(financial.total_revenue)}</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1">Comisión staff</p>
            <p className="text-lg font-semibold text-white">{fmt(financial.total_commission)}</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1">Propinas</p>
            <p className="text-lg font-semibold text-white">{fmt(financial.total_tips)}</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1">Ticket promedio</p>
            <p className="text-lg font-semibold text-white">{fmt(financial.avg_ticket)}</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1">Ingresos/semana</p>
            <p className="text-lg font-semibold text-white">{fmt(financial.revenue_per_week)}</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/50">
            <p className="text-xs text-zinc-500 mb-1">Margen del negocio</p>
            <p className={`text-lg font-semibold ${financial.net_margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmt(financial.net_margin)}
            </p>
          </div>
        </div>
      </div>

      {/* Contract type */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Briefcase size={15} className="text-purple-400" />
            <h3 className="text-sm font-medium text-white">Tipo de contrato</h3>
          </div>
          {!contractEditing && (
            <button onClick={() => setContractEditing(true)} className="text-xs text-amber-400 hover:text-amber-300">
              Cambiar
            </button>
          )}
        </div>

        {!contractEditing ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Tipo</span>
              <span className="text-white">{financial.contract_type === 'fixed_salary' ? 'Salario fijo' : 'Comisión'}</span>
            </div>
            {financial.contract_type === 'commission' ? (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-400">% staff</span>
                  <span className="text-white">{financial.staff_percent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">% negocio</span>
                  <span className="text-white">{financial.business_percent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Fuente</span>
                  <span className="text-zinc-300">{financial.commission_source === 'override' ? 'Personalizada' : 'Por defecto'}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Salario mensual</span>
                  <span className="text-white">{fmt(financial.monthly_salary)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Costo empleador (×{financial.employer_factor})</span>
                  <span className="text-white">{fmt(financial.employer_cost_period)}</span>
                </div>
                <p className="text-xs text-zinc-600 mt-2">
                  Factor incluye: salud, pensión, ARL, caja, prima, cesantías, intereses cesantías, vacaciones (normativa colombiana).
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              {[
                { id: 'commission', label: 'Comisión', desc: 'Porcentaje sobre servicios' },
                { id: 'fixed_salary', label: 'Salario fijo', desc: 'Mensual + prestaciones' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setContractType(opt.id)}
                  className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                    contractType === opt.id
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
            {contractType === 'fixed_salary' && (
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Salario mensual (COP)</label>
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={monthlySalary}
                  onChange={e => setMonthlySalary(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50"
                  placeholder="Ej: 1300000"
                />
                {monthlySalary > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Costo empleador estimado: {fmt(Math.round(monthlySalary * 1.52))}/mes (factor 1.52×)
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setContractEditing(false)} className="flex-1 py-2 text-sm text-zinc-400 rounded-lg border border-zinc-700 hover:bg-white/5">
                Cancelar
              </button>
              <button
                onClick={saveContract}
                disabled={savingContract || (contractType === 'fixed_salary' && monthlySalary <= 0)}
                className="flex-1 py-2 text-sm font-medium bg-amber-500 text-black rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingContract ? 'Guardando...' : 'Guardar contrato'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Weekly breakdown chart */}
      {financial.weekly_breakdown.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={15} className="text-amber-400" />
            <h3 className="text-sm font-medium text-white">Desglose semanal</h3>
          </div>
          <WeeklyChart data={financial.weekly_breakdown} />
        </div>
      )}
    </div>
  );
}
