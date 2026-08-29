// NEXUS_AUTH_BRAND_UNIFY_V15: see ForgotPin.js — same fix (--app-* tokens +
// .nexus-glass instead of hardcoded bg-black/blue so the org's client-portal
// theme, set by <ClientPortalThemeWrapper> in App.js, actually shows through).
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowLeft, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';

export default function ResetPin() {
  const { orgId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalidToken(true);
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!/^\d{4}$/.test(newPin)) {
      toast.error('El PIN debe ser de 4 dígitos');
      return;
    }

    if (newPin !== confirmPin) {
      toast.error('Los PINs no coinciden');
      return;
    }

    setLoading(true);
    try {
      await api.post('/public/clients/reset-pin', {
        token,
        new_pin: newPin
      });

      setSuccess(true);
      toast.success('PIN restablecido exitosamente');
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 400) {
        toast.error('El enlace es inválido o ha expirado');
        setInvalidToken(true);
      } else {
        toast.error(error.response?.data?.detail || 'Error al restablecer el PIN');
      }
    } finally {
      setLoading(false);
    }
  };

  if (invalidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center nexus-glass rounded-3xl p-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--app-danger-soft)] flex items-center justify-center mx-auto mb-6">
            <XCircle size={32} className="text-[var(--app-danger)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--app-text-primary)] mb-3">Enlace inválido</h1>
          <p className="text-[var(--app-text-secondary)] mb-8">
            Este enlace de restablecimiento no es válido o ha expirado. Por favor, solicita uno nuevo.
          </p>
          <div className="space-y-3">
            <Link
              to={`/portal/${orgId}/forgot-pin`}
              className="block w-full py-3 bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-medium rounded-xl transition-all"
            >
              Solicitar nuevo enlace
            </Link>
            <Link
              to={`/portal/${orgId}/auth`}
              className="block w-full py-3 bg-[var(--app-surface-solid)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-[var(--app-text-primary)] rounded-xl transition-all"
            >
              Volver a Inicio de Sesión
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center nexus-glass rounded-3xl p-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--app-success-soft)] flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-[var(--app-success)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--app-text-primary)] mb-3">PIN restablecido</h1>
          <p className="text-[var(--app-text-secondary)] mb-8">
            Tu PIN ha sido actualizado exitosamente. Ya puedes iniciar sesión con tu nuevo PIN.
          </p>
          <Link
            to={`/portal/${orgId}/auth`}
            className="block w-full py-3 bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-medium rounded-xl transition-all"
          >
            Iniciar Sesión
          </Link>
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
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--app-text-primary)] mb-2">Restablecer PIN</h1>
          <p className="text-[var(--app-text-secondary)] text-sm">
            Crea un nuevo PIN de 4 dígitos para tu cuenta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
              Nuevo PIN
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={newPin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setNewPin(value);
                }}
                placeholder="••••"
                required
                maxLength={4}
                pattern="\d{4}"
                className="w-full px-4 py-3 bg-[var(--app-surface-solid)] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-[var(--app-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--app-focus-ring)] pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors"
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
              Confirmar Nuevo PIN
            </label>
            <input
              type={showPin ? 'text' : 'password'}
              value={confirmPin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                setConfirmPin(value);
              }}
              placeholder="••••"
              required
              maxLength={4}
              pattern="\d{4}"
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
                Restableciendo...
              </>
            ) : (
              'Restablecer PIN'
            )}
          </button>
        </form>

        <div className="mt-8 p-4 bg-[var(--app-primary-soft)] border border-[var(--app-border)] rounded-xl">
          <p className="text-xs text-[var(--app-text-secondary)] text-center">
            Tu nuevo PIN será solicitado en tu próximo inicio de sesión
          </p>
        </div>
      </div>
    </div>
  );
}