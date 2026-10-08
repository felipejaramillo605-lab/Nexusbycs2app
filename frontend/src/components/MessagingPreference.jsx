import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { clientPortalAPI } from '../api';
import { MESSAGING_CONSENT_TEXT } from '../lib/countryProfile';
import { usePortalT } from '../lib/portalI18n';

/**
 * Preferencia de textos / WhatsApp de la cuenta del cliente. Solo aparece donde se exige consentimiento (Estados Unidos).
 * Activar guarda el texto exacto que se acepta; desactivar equivale a responder STOP.
 */
export default function MessagingPreference() {
  const { t } = usePortalT();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    clientPortalAPI.getMessagingConsent()
      .then((response) => { if (alive) setState(response.data); })
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, []);

  if (!state?.required) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      await clientPortalAPI.setMessagingConsent({ enabled: !state.enabled, text: state.enabled ? undefined : t(MESSAGING_CONSENT_TEXT) });
      setState((current) => ({ ...current, enabled: !current.enabled, reason: current.enabled ? 'opted_out' : null }));
      toast.success(t('Preferencias actualizadas'));
    } catch {
      toast.error(t('No fue posible actualizar tus preferencias'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={state.enabled}
      disabled={busy}
      onClick={toggle}
      data-testid="messaging-preference"
      className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all disabled:opacity-60"
    >
      <MessageSquare size={20} className="text-zinc-400" />
      <div className="text-left">
        <div className="font-medium text-white">{t('Mensajes de texto y WhatsApp')}</div>
        <div className="text-xs text-zinc-400">{state.enabled ? t('Activados') : t('Desactivados')}</div>
      </div>
    </button>
  );
}
