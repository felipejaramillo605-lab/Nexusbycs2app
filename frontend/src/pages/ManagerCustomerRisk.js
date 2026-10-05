import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Eye, RefreshCw, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { customerRiskAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from '../components/design';

export default function ManagerCustomerRisk() {
  const { user } = useAuth(); const navigate = useNavigate(); const [sp] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? sp.get('org_id') : user?.organization_id) || user?.organization_id;
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(false); try { const response = await customerRiskAPI.list({ organization_id: organizationId }); setRows(response.data.items || []); } catch { setError(true); } finally { setLoading(false); } }, [organizationId]);
  useEffect(() => { if (organizationId) load(); }, [organizationId, load]);
  if (loading) return <div className="min-h-screen nexus-screen grid place-items-center">Cargando recomendaciones…</div>;
  if (error) return <div className="min-h-screen nexus-screen grid place-items-center p-6"><EmptyState icon={AlertTriangle} title="No pudimos cargar el riesgo" description="No se muestran datos como si fueran cero." action={<button onClick={load}>Reintentar</button>}/></div>;
  return <div className="min-h-screen nexus-screen p-6"><div className="max-w-5xl mx-auto"><button onClick={() => navigate(`/manager/clients?org_id=${organizationId || ''}`)} className="mb-5 inline-flex gap-2"><ArrowLeft size={18}/>Clientes</button><div className="flex justify-between gap-4 mb-6"><div><h1 className="text-3xl text-[var(--app-text-primary)]">Clientes en riesgo</h1><p className="text-sm text-[var(--app-text-secondary)]">Señales locales para revisar. Nexus no contacta a nadie desde esta pantalla.</p></div><button onClick={load} className="inline-flex gap-2"><RefreshCw size={16}/>Actualizar</button></div>{!rows.length ? <EmptyState icon={Users} title="No hay señales activas" description="Cuando el análisis encuentre recurrencia atrasada o ausencias, aparecerán aquí."/> : <div className="space-y-3">{rows.map(row => <article key={row.client_id} className="rounded-xl border border-[var(--app-border)] p-4 flex justify-between gap-4"><div><strong className="text-[var(--app-text-primary)]">Cliente {row.client_id}</strong><p className="text-sm text-[var(--app-text-secondary)]">Riesgo {row.band === 'high' ? 'alto' : 'medio'} · {row.score}/100</p><p className="text-xs text-[var(--app-text-secondary)]">{row.signals?.days_since_last_visit} días sin visita · {row.signals?.no_show_count} ausencias</p></div><button onClick={() => navigate(`/manager/clients?org_id=${organizationId || ''}`)} className="inline-flex gap-2 self-center"><Eye size={16}/>Ver cliente</button></article>)}</div>}</div></div>;
}
