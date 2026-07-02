import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Mail, Shield } from 'lucide-react';

const PendingApproval = () => {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="glass-panel p-8 sm:p-12 rounded-3xl shadow-elevation-high text-center">
          {/* Icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center shadow-lg shadow-yellow-500/25 animate-pulse">
            <Clock size={40} strokeWidth={1.5} className="text-white" />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-light tracking-tight text-[var(--text-primary)] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Cuenta en Revisión
          </h1>

          {/* Message */}
          <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
            Tu solicitud de registro ha sido recibida exitosamente. 
            El administrador del sistema debe aprobar tu cuenta antes de que puedas acceder.
          </p>

          {/* Info Cards */}
          <div className="space-y-4 mb-8">
            <div className="glass-panel p-4 rounded-xl border border-[var(--border-accent)] bg-[var(--accent-glow)]">
              <div className="flex items-start gap-3">
                <Shield size={20} className="text-[var(--accent)] mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <div className="text-left">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                    Proceso de Seguridad
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Este paso garantiza que solo usuarios autorizados accedan al sistema
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-xl">
              <div className="flex items-start gap-3">
                <Mail size={20} className="text-[var(--accent)] mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <div className="text-left">
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                    Notificación por Email
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Recibirás un correo cuando tu cuenta sea aprobada
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Expected Time */}
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] mb-8">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Tiempo Estimado
            </p>
            <p className="text-2xl font-light text-[var(--text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              24-48 horas
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              to="/login"
              className="block w-full px-6 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-medium transition-all shadow-lg shadow-[var(--accent-glow)]"
            >
              Volver al Login
            </Link>
            <p className="text-xs text-[var(--text-tertiary)]">
              Si tienes dudas, contacta al administrador
            </p>
          </div>
        </div>

        {/* Help Text */}
        <p className="mt-6 text-center text-xs text-[var(--text-tertiary)]">
          ¿Necesitas ayuda urgente?{' '}
          <a href="mailto:support@nexus.com" className="text-[var(--accent)] hover:underline">
            Contacta soporte
          </a>
        </p>
      </div>
    </div>
  );
};

export default PendingApproval;
