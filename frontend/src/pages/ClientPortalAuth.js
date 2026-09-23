// The shared portal wrapper remains the source of visual theme variables.
import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, LogIn, UserPlus, ArrowLeft, Loader2, Eye, EyeOff, Cake } from 'lucide-react';
import { useClientPortalAuth } from '../hooks/useClientPortalAuth';

export default function ClientPortalAuth() {
  const {
    orgId, mode, setMode, phone, setPhone, name, setName, pin, setPin, birthday,
    setBirthday, showPin, setShowPin, marketingConsent, setMarketingConsent, loading,
    organizationName, organization, handleLogin, handleRegister,
  } = useClientPortalAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full nexus-glass rounded-3xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to={`/book/${orgId}`} className="inline-flex items-center gap-2 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] transition-colors mb-6">
            <ArrowLeft size={16} />
            <span className="text-sm">Volver a reservar</span>
          </Link>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--app-primary)] to-[var(--app-primary-hover)] flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--app-text-primary)] mb-2">Portal de Clientes</h1>
          <p className="text-[var(--app-text-secondary)] text-sm">{organizationName}</p>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6 p-1 bg-[var(--app-surface-solid)] rounded-xl border border-[var(--app-border)]">
          <button
            data-testid="portal-login-tab"
            onClick={() => setMode('login')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'login'
                ? 'bg-[var(--app-primary)] text-white'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]'
            }`}
          >
            <LogIn size={16} className="inline mr-2" />
            Iniciar Sesión
          </button>
          <button
            data-testid="portal-register-tab"
            onClick={() => setMode('register')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'register'
                ? 'bg-[var(--app-primary)] text-white'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]'
            }`}
          >
            <UserPlus size={16} className="inline mr-2" />
            Registrarse
          </button>
        </div>

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
              Teléfono
            </label>
            <input
              data-testid="portal-phone-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 123 4567"
              required
              className="w-full px-4 py-3 bg-[var(--app-surface-solid)] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-[var(--app-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--app-focus-ring)]"
            />
          </div>

          {/* Name (only for register) */}
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
                Nombre completo
              </label>
              <input
                data-testid="portal-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Pérez"
                required
                maxLength={100}
                className="w-full px-4 py-3 bg-[var(--app-surface-solid)] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] placeholder-[var(--app-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--app-focus-ring)]"
              />
            </div>
          )}

          {/* Birthday (only for register, only if the org's birthday campaign is on) -- NEXUS_BIRTHDAY_CAMPAIGN_V1 */}
          {mode === 'register' && organization?.birthday_campaign?.enabled && (
            <div>
              <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
                <Cake size={14} className="inline mr-1.5 -mt-0.5" />
                Fecha de cumpleaños <span className="text-[var(--app-text-muted)] font-normal">(opcional)</span>
              </label>
              <input
                data-testid="portal-birthday-input"
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--app-surface-solid)] border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--app-focus-ring)]"
              />
              <p className="text-xs text-[var(--app-text-muted)] mt-1">
                Así podemos sorprenderte con algo especial ese día
              </p>
            </div>
          )}

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-[var(--app-text-secondary)] mb-2">
              PIN de 4 dígitos
            </label>
            <div className="relative">
              <input
                data-testid="portal-pin-input"
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(value);
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
            {mode === 'register' && (
              <p className="text-xs text-[var(--app-text-muted)] mt-1">
                Usa un PIN que puedas recordar fácilmente
              </p>
            )}
          </div>

          {/* Marketing Consent (only for register) */}
          {mode === 'register' && (
            <div className="bg-[var(--app-surface-solid)] border border-[var(--app-border)] rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  data-testid="portal-marketing-checkbox"
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-[var(--app-primary)]"
                />
                <div className="flex-1">
                  <p className="text-sm text-[var(--app-text-secondary)]">
                    Acepto recibir promociones y novedades por correo/WhatsApp
                  </p>
                  <p className="text-xs text-[var(--app-text-muted)] mt-1">
                    Puedes cancelar en cualquier momento
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Submit Button */}
          <button
            data-testid={mode === 'login' ? 'portal-login-submit' : 'portal-register-submit'}
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[var(--app-primary)] to-[var(--app-primary-hover)] hover:opacity-90 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {mode === 'login' ? 'Iniciando...' : 'Creando cuenta...'}
              </>
            ) : (
              <>
                {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </>
            )}
          </button>

          {/* Forgot PIN Link */}
          {mode === 'login' && (
            <div className="text-center">
              <Link
                to={`/portal/${orgId}/forgot-pin`}
                className="text-sm text-[var(--app-primary)] hover:text-[var(--app-primary-hover)] transition-colors"
              >
                ¿Olvidaste tu PIN?
              </Link>
            </div>
          )}
        </form>

        {/* Info */}
        <div className="mt-8 p-4 bg-[var(--app-primary-soft)] border border-[var(--app-border)] rounded-xl">
          <p className="text-xs text-[var(--app-text-secondary)] text-center">
            {mode === 'login'
              ? 'Después de 5 intentos fallidos, tu cuenta se bloqueará por 15 minutos'
              : 'Tu PIN es personal y confidencial. No lo compartas con nadie'}
          </p>
        </div>
      </div>
    </div>
  );
}