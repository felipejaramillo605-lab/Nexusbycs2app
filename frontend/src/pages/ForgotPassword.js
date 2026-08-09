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
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-2 mb-6 text-zinc-400 hover:text-white">
          <ArrowLeft size={18} /> Volver al login
        </Link>
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0A84FF]/20 flex items-center justify-center mb-6">
            <Mail className="text-[#0A84FF]" />
          </div>
          <h1 className="text-3xl font-light text-white mb-2">Recuperar contraseña</h1>
          <p className="text-zinc-400 text-sm mb-7">Ingresa tu correo. Si existe una cuenta manual asociada, recibirás un enlace de recuperación.</p>
          {submitted ? (
            <div role="status" className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm">
              Revisa tu bandeja de entrada y la carpeta de correo no deseado. Por seguridad, mostramos este mensaje para cualquier dirección.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="forgot-email" className="block text-sm text-zinc-400 mb-2">Correo electrónico</label>
                <input id="forgot-email" name="email" type="email" autoComplete="email" required disabled={loading} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-[#0A84FF] outline-none" />
              </div>
              <button type="submit" disabled={loading} className="w-full h-12 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50">
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
