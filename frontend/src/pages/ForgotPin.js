// NEXUS_AUTH_BRAND_UNIFY_V15: this page is wrapped by <ClientPortalThemeWrapper>
// (see App.js) which remaps --app-* to the organization's client-portal theme
// and paints the body/orb background — but the JSX below still hardcoded
// bg-black + Tailwind blue, hiding that themed background behind a flat
// black div. Switching to --app-* vars + .nexus-glass lets the org's real
// branding (and the v13.1 animated orbs) show through, same as
// ClientPortalAuth.js should.
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';

export default function ForgotPin() {
  const { orgId } = useParams();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast.error('Ingresa tu número de teléfono');
      return;
    }

    setLoading(true);
    try {
      await api.post('/public/clients/forgot-pin', {
        phone: phone.trim(),
        organization_id: orgId
      });

      setSent(true);
      toast.success('Revisa tu correo electrónico');
    } catch (error) {
      // Por seguridad, el backend siempre responde exitosamente
      // incluso si el teléfono no existe
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center nexus-glass rounded-3xl p-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--app-success-soft)] flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-[var(--app-success)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--app-text-primary)] mb-3">Revisa tu correo</h1>
          <p className="text-[var(--app-text-secondary)] mb-8">
            Si tu teléfono está registrado, recibirás un correo con instrucciones para restablecer tu PIN.
          </p>
          <div className="space-y-3">
            <Link
              to={`/portal/${orgId}/auth`}
              className="block w-full py-3 bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-medium rounded-xl transition-all"
            >
              Volver a Inicio de Sesión
            </Link>
            <p className="text-sm text-[var(--app-text-muted)]">
              ¿No recibiste el correo? Revisa tu carpeta de spam o intenta de nuevo en unos minutos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full nexus-glass rounded-3xl p-8">
        <Link
          to={`/portal/${orgId}/auth`}
          className="inline-flex items-center gap-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors mb-6 text-sm"
        >
          <ArrowLeft size={16} />
          Volver
        </Link>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--app-primary)] to-[var(--app-primary-hover)] flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--app-text-primary)] mb-2">¿Olvidaste tu PIN?</h1>
          <p className="text-[var(--app-text-secondary)] text-sm">
            Ingresa tu teléfono y te enviaremos instrucciones por correo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
              Teléfono registrado
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 123 4567"
              required
              className="w-full px-4 py-3 bg-[var(--app-surface-solid)] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-[var(--app-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--app-focus-ring)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[var(--app-primary)] to-[var(--app-primary-hover)] hover:opacity-90 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar instrucciones'
            )}
          </button>
        </form>

        <div className="mt-8 p-4 bg-[var(--app-primary-soft)] border border-[var(--app-border)] rounded-xl">
          <p className="text-xs text-[var(--app-text-secondary)] text-center">
            Por tu seguridad, enviaremos el correo solo si el teléfono está registrado en nuestro sistema
          </p>
        </div>
      </div>
    </div>
  );
}