import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001/api';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');
  
  const phone = searchParams.get('phone');
  const email = searchParams.get('email');
  const orgId = searchParams.get('org');

  useEffect(() => {
    const unsubscribe = async () => {
      if (!phone && !email) {
        setStatus('error');
        setMessage('Faltan parámetros requeridos');
        return;
      }

      if (!orgId) {
        setStatus('error');
        setMessage('Falta el ID de organización');
        return;
      }

      try {
        const response = await axios.post(`${API}/public/clients/unsubscribe`, {
          phone: phone || undefined,
          email: email || undefined,
          organization_id: orgId
        });

        setStatus('success');
        setMessage(response.data.message || '¡Has sido dado de baja exitosamente!');
        toast.success('Suscripción cancelada');
      } catch (error) {
        setStatus('error');
        setMessage(error.response?.data?.detail || 'No fue posible procesar tu solicitud');
        toast.error('Error al cancelar suscripción');
      }
    };

    unsubscribe();
  }, [phone, email, orgId]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gradient-to-br from-zinc-900 to-black border border-white/10 rounded-2xl p-8 text-center">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            {status === 'loading' && (
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Loader2 size={32} className="text-blue-400 animate-spin" />
              </div>
            )}
            {status === 'success' && (
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle size={32} className="text-green-400" />
              </div>
            )}
            {status === 'error' && (
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle size={32} className="text-red-400" />
              </div>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-white mb-3">
            {status === 'loading' && 'Procesando solicitud...'}
            {status === 'success' && '¡Suscripción cancelada!'}
            {status === 'error' && 'Error al procesar'}
          </h1>

          {/* Message */}
          <p className="text-zinc-400 mb-6">
            {message || 'Procesando tu solicitud de baja...'}
          </p>

          {/* Additional Info for Success */}
          {status === 'success' && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-start gap-3">
                <Mail size={20} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-zinc-300">
                  <p className="font-medium mb-2">¿Qué significa esto?</p>
                  <ul className="space-y-1 text-zinc-400">
                    <li>• Ya no recibirás promociones ni ofertas</li>
                    <li>• Seguirás recibiendo confirmaciones de citas</li>
                    <li>• Puedes volver a suscribirte cuando quieras</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {status !== 'loading' && (
            <button
              onClick={() => navigate('/')}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all duration-200"
            >
              Ir al inicio
            </button>
          )}

          {/* Footer */}
          <p className="text-xs text-zinc-500 mt-6">
            Si deseas volver a recibir promociones, contacta directamente al negocio.
          </p>
        </div>

        {/* Legal Info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-600">
            Esta acción es parte de nuestro compromiso con tu privacidad.<br />
            Cumplimos con CAN-SPAM Act, TCPA y Ley 1581 de 2012 (Colombia).
          </p>
        </div>
      </div>
    </div>
  );
}
