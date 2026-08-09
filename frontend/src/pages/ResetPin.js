import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowLeft, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001/api';

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
      await axios.post(`${API}/public/clients/reset-pin`, {
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
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <XCircle size={32} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Enlace inválido</h1>
          <p className="text-zinc-400 mb-8">
            Este enlace de restablecimiento no es válido o ha expirado. Por favor, solicita uno nuevo.
          </p>
          <div className="space-y-3">
            <Link
              to={`/portal/${orgId}/forgot-pin`}
              className="block w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-all"
            >
              Solicitar nuevo enlace
            </Link>
            <Link
              to={`/portal/${orgId}/auth`}
              className="block w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all"
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
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">PIN restablecido</h1>
          <p className="text-zinc-400 mb-8">
            Tu PIN ha sido actualizado exitosamente. Ya puedes iniciar sesión con tu nuevo PIN.
          </p>
          <Link
            to={`/portal/${orgId}/auth`}
            className="block w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-all"
          >
            Iniciar Sesión
          </Link>
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
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Restablecer PIN</h1>
          <p className="text-zinc-400 text-sm">
            Crea un nuevo PIN de 4 dígitos para tu cuenta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
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
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
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
                Restableciendo...
              </>
            ) : (
              'Restablecer PIN'
            )}
          </button>
        </form>

        <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <p className="text-xs text-zinc-400 text-center">
            Tu nuevo PIN será solicitado en tu próximo inicio de sesión
          </p>
        </div>
      </div>
    </div>
  );
}
