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
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Revisa tu correo</h1>
          <p className="text-zinc-400 mb-8">
            Si tu teléfono está registrado, recibirás un correo con instrucciones para restablecer tu PIN.
          </p>
          <div className="space-y-3">
            <Link
              to={`/portal/${orgId}/auth`}
              className="block w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-all"
            >
              Volver a Inicio de Sesión
            </Link>
            <p className="text-sm text-zinc-500">
              ¿No recibiste el correo? Revisa tu carpeta de spam o intenta de nuevo en unos minutos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Link
          to={`/portal/${orgId}/auth`}
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6 text-sm"
        >
          <ArrowLeft size={16} />
          Volver
        </Link>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">¿Olvidaste tu PIN?</h1>
          <p className="text-zinc-400 text-sm">
            Ingresa tu teléfono y te enviaremos instrucciones por correo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Teléfono registrado
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+57 300 123 4567"
              required
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

        <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <p className="text-xs text-zinc-400 text-center">
            Por tu seguridad, enviaremos el correo solo si el teléfono está registrado en nuestro sistema
          </p>
        </div>
      </div>
    </div>
  );
}
