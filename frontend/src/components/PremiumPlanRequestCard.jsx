import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, Sparkles } from 'lucide-react';
import { premiumPlanAPI } from '../api';

const VALID_STATUSES = new Set(['not_requested', 'pending', 'active']);

export default function PremiumPlanRequestCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(premiumPlanAPI.createRequestId());
  const submittingRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextStatus = (await premiumPlanAPI.getStatus())?.data?.status;
      if (!VALID_STATUSES.has(nextStatus)) throw new Error('Respuesta de estado no válida');
      setStatus(nextStatus);
    } catch {
      setStatus(null);
      setError('No se pudo consultar el estado del plan Premium. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await premiumPlanAPI.request(requestId.current);
      const nextStatus = response?.data?.status;
      if (!VALID_STATUSES.has(nextStatus)) throw new Error('Respuesta de solicitud no válida');
      setStatus(nextStatus);
    } catch (requestError) {
      if (requestError?.response?.status === 409) {
        await refresh();
        return;
      }
      setError('No se pudo enviar la solicitud. Puedes intentarlo de nuevo.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  let heading = 'Plan Premium';
  let description = 'Solicita Nexus AI y las plantillas premium del portal para tu organización. El Owner revisará la solicitud y te informará el siguiente paso de pago.';
  let icon = <Sparkles size={20} aria-hidden="true" />;
  if (status === 'pending') {
    heading = 'Solicitud enviada';
    description = 'El Owner revisará tu solicitud. Cuando confirme el excedente pagado, podrá activar el plan para tu organización.';
    icon = <Clock3 size={20} aria-hidden="true" />;
  } else if (status === 'active') {
    heading = 'Plan Premium activo';
    description = 'Tu organización ya tiene acceso a Nexus AI y a las plantillas premium del portal.';
    icon = <CheckCircle2 size={20} aria-hidden="true" />;
  }

  return (
    <section data-testid="premium-plan-request-card" aria-labelledby="premium-plan-heading" className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-[var(--app-primary)]/20 flex items-center justify-center text-[var(--app-primary)]">{icon}</div>
        <div className="min-w-0 flex-1">
          <div data-testid="premium-plan-status" role="status" aria-live="polite" aria-atomic="true">
            <h2 id="premium-plan-heading" className="text-lg font-medium text-[var(--app-text-primary)]">{heading}</h2>
            <p className="mt-2 text-sm text-[var(--app-text-secondary)]">{description}</p>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            {loading ? (
              <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm text-[var(--app-text-secondary)]"><Loader2 size={16} className="animate-spin" /> Consultando el plan Premium…</span>
            ) : status === 'not_requested' ? (
              <button data-testid="premium-plan-request-button" type="button" onClick={submit} disabled={submitting} className="nexus-button nexus-button-primary inline-flex items-center gap-2">
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? 'Enviando solicitud…' : 'Solicitar plan Premium'}
              </button>
            ) : null}
            {error && !loading && <button type="button" onClick={refresh} className="nexus-button nexus-button-secondary">Reintentar</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
