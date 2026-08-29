// NEXUS_AUTH_BRAND_UNIFY_V15: theme tokens instead of hardcoded black/blue.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import { authAPI } from '../api';
import { toast } from 'sonner';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await authAPI.forgotPassword({ email: email.trim().toLowerCase() });
      setSubmitted(true);
      toast.success('Solicitud procesada');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-2 mb-6 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <ArrowLeft size={18} /> Volver al login
        </Link>
        <div className="glass-panel rounded-3xl p-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center mb-6">
            <Mail className="text-[var(--accent)]" />
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">Recuperar contraseña</h1>
          <p className="text-[var(--text-secondary)] text-sm mb-7">Ingresa tu correo. Si existe una cuenta manual asociada, recibirás un enlace de recuperación.</p>
          {submitted ? (
            <div role="status" className="p-4 rounded-xl bg-[var(--app-success-soft)] border border-[var(--app-success)]/20 text-[var(--app-success)] text-sm">
              Revisa tu bandeja de entrada y la carpeta de correo no deseado. Por seguridad, mostramos este mensaje para cualquier dirección.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="forgot-email" className="block text-sm text-[var(--text-secondary)] mb-2">Correo electrónico</label>
                <input id="forgot-email" name="email" type="email" autoComplete="email" required disabled={loading} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)] outline-none transition-all" />
              </div>
              <button type="submit" disabled={loading} className="w-full h-12 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                {loading && <Loader2 size={18} className="animate-spin" />}
                {loading ? 'Procesando...' : 'Enviar enlace'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;