import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { retentionAPI } from '../api';
import { ActionButton, SurfaceCard } from './design';

const PHRASE = 'PURGAR ORGANIZACIONES';

// Supresion definitiva de organizaciones dadas de baja hace mas de 90 dias: borra sus imagenes (R2, espejo y disco) y
// anonimiza a sus clientes. Simulacion primero; se ejecuta solo si el Owner escribe la frase.
export default function OwnerOrgRetention() {
  const [plan, setPlan] = useState(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await retentionAPI.organizationsPlan();
      setPlan(response.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No pudimos calcular las organizaciones pendientes');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    try {
      const response = await retentionAPI.purgeOrganizations(phrase);
      setResult(response.data);
      setPhrase('');
      toast.success('Supresión ejecutada');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No fue posible ejecutar');
    } finally {
      setBusy(false);
    }
  };

  const items = plan?.organizations || [];
  return (
    <SurfaceCard>
      <h2 className="text-lg">Organizaciones dadas de baja</h2>
      <p className="text-sm mt-1">
        Pasados {plan?.retention_days || 90} días de la baja se borran sus imágenes (almacenamiento durable, espejo y disco) y se anonimiza a sus clientes. Es irreversible.
      </p>
      {plan && items.length === 0 && <p className="mt-3 text-sm" data-testid="org-retention-empty">No hay organizaciones pendientes.</p>}
      {items.length > 0 && (
        <ul className="mt-3 space-y-1" data-testid="org-retention-list">
          {items.map((item) => (
            <li key={item.organization_id}>
              <strong>{item.name || item.organization_id}</strong> · baja {String(item.deleted_at || '').slice(0, 10)} · {item.media_files} imagen(es) · {item.clients} cliente(s)
            </li>
          ))}
        </ul>
      )}
      <label className="block mt-4">
        Para ejecutar escribe <strong>{PHRASE}</strong>
        <input className="nexus-field" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" />
      </label>
      <div className="mt-4">
        <ActionButton variant="destructive" icon={Trash2} loading={busy} disabled={phrase !== PHRASE || items.length === 0} onClick={run}>
          Purgar {items.length} organización(es)
        </ActionButton>
      </div>
      {result && (
        <p className="mt-3 text-sm" data-testid="org-retention-result">
          Última ejecución: {(result.organizations || []).filter((item) => item.completed).length} completada(s) y{' '}
          {(result.organizations || []).filter((item) => !item.completed).length} pendiente(s) de reintento.
        </p>
      )}
    </SurfaceCard>
  );
}
