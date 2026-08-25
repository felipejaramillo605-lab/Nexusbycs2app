import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, FileText, Mail, Phone, MapPin } from 'lucide-react';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Política de Privacidad</h1>
              <p className="text-xs text-zinc-400">Nexus by CS2</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="prose prose-invert max-w-none">
          {/* Introduction */}
          <section className="mb-8">
            <p className="text-sm text-zinc-400 mb-4">Última actualización: Diciembre 2025</p>
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              1. Introducción
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus by CS2 ("nosotros", "nuestro" o "la Plataforma") respeta tu privacidad y está comprometido 
              con la protección de tus datos personales. Esta Política de Privacidad explica cómo recopilamos, 
              usamos, compartimos y protegemos tu información personal.
            </p>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
              <p className="text-sm text-zinc-300">
                <strong className="text-white">Jurisdicciones aplicables:</strong>
              </p>
              <ul className="list-disc list-inside text-sm text-zinc-400 mt-2 space-y-1">
                <li>🇺🇸 Estados Unidos (Florida) - TCPA, CAN-SPAM Act, FIPA</li>
                <li>🇨🇴 Colombia - Ley 1581 de 2012, Decreto 1377 de 2013</li>
              </ul>
            </div>
          </section>

          {/* What Data */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              2. ¿Qué Datos Recopilamos?
            </h2>
            <p className="text-zinc-300 mb-4">
              Recopilamos la siguiente información personal cuando realizas una reserva de cita, 
              creas una cuenta en el Portal del Cliente, o aceptas recibir comunicaciones de marketing:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-2 mb-4">
              <li>Nombre completo</li>
              <li>Número de teléfono</li>
              <li>Correo electrónico</li>
              <li>Historial de citas (fecha, hora, servicio, profesional)</li>
              <li>Dirección IP (al dar consentimiento de marketing)</li>
              <li>Timestamp de consentimiento (fecha y hora)</li>
            </ul>
          </section>

          {/* Usage */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              3. ¿Para Qué Usamos Tus Datos?
            </h2>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Uso primario (necesario para el servicio):</h3>
              <ul className="list-disc list-inside text-zinc-300 space-y-1">
                <li>Gestionar y confirmar tus citas</li>
                <li>Enviarte recordatorios de citas (24 horas antes)</li>
                <li>Notificarte sobre cambios o cancelaciones</li>
                <li>Mantener tu historial de servicios</li>
              </ul>
            </div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">
                Uso secundario (requiere tu consentimiento explícito):
              </h3>
              <ul className="list-disc list-inside text-zinc-300 space-y-1">
                <li>Enviar promociones y ofertas especiales</li>
                <li>Enviar novedades del negocio por WhatsApp/Email</li>
                <li>Campañas de marketing y retención de clientes</li>
              </ul>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <p className="text-sm text-zinc-300">
                <strong className="text-white">IMPORTANTE:</strong> Puedes optar por NO recibir comunicaciones 
                de marketing y aún así usar todos nuestros servicios de reserva y gestión de citas.
              </p>
            </div>
          </section>

          {/* ARCO Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              5. Tus Derechos (ARCO - Ley 1581 Colombia)
            </h2>
            <p className="text-zinc-300 mb-4">
              Tienes los siguientes derechos sobre tus datos personales:
            </p>
            
            <div className="grid gap-4 mb-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">📊 Acceso</h3>
                <p className="text-sm text-zinc-400">
                  Solicita una copia de todos tus datos personales que tenemos almacenados.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">✏️ Corrección/Actualización</h3>
                <p className="text-sm text-zinc-400">
                  Corrige o actualiza tu nombre o correo electrónico.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">🗑️ Supresión/Eliminación</h3>
                <p className="text-sm text-zinc-400">
                  Solicita la eliminación de tus datos personales. Plazo de respuesta: 15 días hábiles.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">🚫 Revocación de Consentimiento</h3>
                <p className="text-sm text-zinc-400 mb-2">
                  Cancela tu suscripción a comunicaciones de marketing en cualquier momento.
                </p>
                <a 
                  href="/unsubscribe" 
                  className="text-blue-400 hover:underline text-sm"
                >
                  Cancelar suscripción →
                </a>
              </div>
            </div>
          </section>

          {/* Security */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              7. Seguridad de Datos
            </h2>
            <p className="text-zinc-300 mb-4">
              Implementamos medidas de seguridad para proteger tu información:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-1">
              <li>🔒 Encriptación de contraseñas (bcrypt)</li>
              <li>🔒 Cookies seguras (httpOnly, secure)</li>
              <li>🔒 Headers de seguridad (CSP, HSTS, X-Frame-Options)</li>
              <li>🔒 CORS restrictivo</li>
              <li>🔒 Acceso basado en roles (RLS)</li>
            </ul>
          </section>
        </div>

        {/* Contact Section */}
        <div className="mt-12 p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <FileText size={24} className="text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">
                Contacto
              </h3>
              <p className="text-zinc-300 text-sm mb-4">
                Si tienes preguntas sobre esta política o deseas ejercer tus derechos:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Mail size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Email</p>
                    <a 
                      href="mailto:nexusbycs2@gmail.com" 
                      className="text-blue-400 hover:underline text-sm"
                    >
                      nexusbycs2@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Teléfono</p>
                    <a 
                      href="tel:+573103705753" 
                      className="text-blue-400 hover:underline text-sm"
                    >
                      +57 310 370 5753
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Dirección</p>
                    <p className="text-sm text-zinc-300">
                      Cr 51 #96 sur 50<br />
                      La Estrella, Antioquia, Colombia
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs text-zinc-500 mb-1">Responsable</p>
                  <p className="text-sm text-white font-medium">Felipe Jaramillo Parra</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full Document Link */}
        <div className="mt-6 text-center">
          <a 
            href="/PRIVACY_POLICY.md" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline text-sm"
          >
            Ver documento completo (PDF/MD) →
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-zinc-500">
          <p>© 2025 Nexus by CS2. Todos los derechos reservados.</p>
          <p className="mt-2">
            Cumplimos con TCPA, CAN-SPAM Act, FIPA y Ley 1581 de 2012 (Colombia)
          </p>
        </div>
      </footer>
    </div>
  );
}

