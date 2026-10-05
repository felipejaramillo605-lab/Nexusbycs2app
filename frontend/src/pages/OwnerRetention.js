import React, { useCallback, useEffect, useState } from 'react';
import { Eraser, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { retentionAPI } from '../api';
import OwnerOrgRetention from '../components/OwnerOrgRetention';
import { ActionButton, MotionPage, PageHeader, SurfaceCard } from '../components/design';

const PHRASE = 'EJECUTAR RETENCION';

export default function OwnerRetention() {
  const [plan, setPlan] = useState(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await retentionAPI.plan();
      setPlan(response.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No pudimos calcular el plan');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    try {
      const response = await retentionAPI.run(phrase);
      setResult(response.data);
      setPhrase('');
      toast.success('Retención ejecutada');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No fue posible ejecutar');
    } finally {
      setBusy(false);
    }
  };

  const pending = plan ? plan.deletion_requests + plan.inactive_clients : 0;

  return (
    <div className="nexus-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <MotionPage className="space-y-6">
          <PageHeader
            eyebrow="IT y auditoría"
            title="Retención de datos"
            description="Anonimiza clientes que pidieron su supresión o llevan más de 2 años inactivos. Nada se ejecuta solo."
            actions={<ActionButton variant="secondary" icon={RefreshCw} onClick={load}>Recalcular</ActionButton>}
          />
          {plan && (
            <SurfaceCard>
              <h2 className="text-lg">Simulación (no cambia nada)</h2>
              <ul className="mt-3 space-y-1">
                <li>Solicitudes de supresión pendientes: <strong>{plan.deletion_requests}</strong></li>
                <li>Clientes inactivos &gt; {plan.inactivity_days} días: <strong>{plan.inactive_clients}</strong></li>
                <li>Eventos de auditoría con más de 2 años (solo informativo): <strong>{plan.audit_events_older_than_retention}</strong></li>
              </ul>
              <p className="text-xs mt-3">Anonimizar quita nombre, teléfono, correo, PIN, cumpleaños y consentimientos con IP; conserva visitas y puntos. Las imágenes y los soportes contables de cada negocio no se tocan.</p>
            </SurfaceCard>
          )}
          <SurfaceCard>
            <label className="block">
              Para ejecutar escribe <strong>{PHRASE}</strong>
              <input className="nexus-field" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" />
            </label>
            <div className="mt-4">
              <ActionButton variant="destructive" icon={Eraser} loading={busy} disabled={phrase !== PHRASE || pending === 0} onClick={run}>
                Anonimizar {pending} cliente(s)
              </ActionButton>
            </div>
            {result && (
              <p className="mt-3 text-sm">
                Última ejecución: {result.anonymized_deletion_requests} por solicitud y {result.anonymized_inactive} por inactividad.
              </p>
            )}
          </SurfaceCard>
          <OwnerOrgRetention />
        </MotionPage>
      </div>
    </div>
  );
}
