import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, FileText, Mail, Phone, MapPin, Scale, Globe, Clock, Users, Lock, Bell, UserCheck } from 'lucide-react';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
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
              <h1 className="text-lg font-semibold">Politica de Privacidad</h1>
              <p className="text-xs text-zinc-400">Nexus by CS2</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="prose prose-invert max-w-none">

          {/* --- 1. Identificacion del Responsable --- */}
          <section className="mb-8">
            <p className="text-sm text-zinc-400 mb-4">Ultima actualizacion: agosto de 2026</p>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 mb-6">
              <div className="flex items-start gap-3 mb-3">
                <UserCheck size={20} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <h3 className="text-base font-semibold text-white">Responsable del Tratamiento</h3>
              </div>
              <div className="text-sm text-zinc-300 space-y-1 ml-8">
                <p><strong className="text-white">Razon social:</strong> Felipe Jaramillo Parra (persona natural, actividad comercial bajo el nombre "Nexus by CS2")</p>
                <p><strong className="text-white">NIT / C.C.:</strong> [Pendiente de inclusion por el titular]</p>
                <p><strong className="text-white">Domicilio:</strong> Cr 51 #96 sur 50, La Estrella, Antioquia, Colombia</p>
                <p><strong className="text-white">Correo de contacto:</strong> nexusbycs2@gmail.com</p>
                <p><strong className="text-white">Telefono:</strong> +57 310 370 5753</p>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              1. Introduccion y alcance
            </h2>
            <p className="text-zinc-300 mb-4">
              Esta Politica de Privacidad (en adelante "la Politica") describe como Nexus by CS2 (en adelante
              "Nexus", "nosotros" o "la Plataforma") recopila, usa, almacena, comparte y protege los datos
              personales de los usuarios de la plataforma, incluyendo:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-1 mb-4">
              <li><strong className="text-white">Clientes finales</strong> que reservan citas o crean cuentas en el Portal del Cliente.</li>
              <li><strong className="text-white">Duenos y administradores de negocio</strong> (Owners, Managers) que operan la plataforma para gestionar sus establecimientos.</li>
              <li><strong className="text-white">Profesionales</strong> (Staff/barberos) registrados por el negocio.</li>
            </ul>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <Scale size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-white font-medium mb-1">Marco juridico aplicable</p>
                  <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
                    <li>Colombia: Ley Estatutaria 1581 de 2012 (Habeas Data), Decreto 1377 de 2013, y demas normas reglamentarias. Autoridad de vigilancia: Superintendencia de Industria y Comercio (SIC).</li>
                    <li>Estados Unidos (Florida): TCPA (Telephone Consumer Protection Act), CAN-SPAM Act, FIPA (Florida Information Protection Act of 2014).</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* --- 2. Datos que recopilamos --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              2. Datos personales que recopilamos
            </h2>
            <p className="text-zinc-300 mb-4">
              Recopilamos datos personales cuando interactuas con la Plataforma, incluyendo pero no limitado a:
            </p>

            <div className="grid gap-4 mb-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Datos de identificacion</h3>
                <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
                  <li>Nombre completo</li>
                  <li>Numero de telefono celular</li>
                  <li>Correo electronico</li>
                </ul>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Datos de uso del servicio</h3>
                <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
                  <li>Historial de citas (fecha, hora, servicio solicitado, profesional asignado)</li>
                  <li>Resenas y calificaciones que publiques</li>
                  <li>Preferencias de notificacion</li>
                </ul>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Datos tecnicos y de consentimiento</h3>
                <ul className="list-disc list-inside text-sm text-zinc-400 space-y-1">
                  <li>Direccion IP (registrada al momento de otorgar consentimiento de marketing)</li>
                  <li>Marca temporal (timestamp) del consentimiento</li>
                  <li>Texto exacto de la autorizacion aceptada</li>
                </ul>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-sm text-amber-200">
                <strong>Datos sensibles:</strong> Nexus NO recopila datos biometricos, de salud, orientacion
                sexual, origen etnico, afiliacion politica ni creencias religiosas. Si un profesional o
                cliente incluye voluntariamente informacion sensible en campos de texto libre (p. ej., notas
                de cita), sera responsabilidad del negocio que lo solicita.
              </p>
            </div>
          </section>

          {/* --- 3. Finalidades del tratamiento --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              3. Finalidades del tratamiento
            </h2>

            <div className="mb-5">
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Lock size={16} className="text-green-400" />
                Finalidades necesarias para la prestacion del servicio
              </h3>
              <p className="text-sm text-zinc-400 mb-2">No requieren consentimiento separado; son inherentes al uso de la Plataforma.</p>
              <ul className="list-disc list-inside text-zinc-300 space-y-1">
                <li>Crear y gestionar tu cuenta de usuario</li>
                <li>Agendar, confirmar, modificar y cancelar citas</li>
                <li>Enviar recordatorios de citas (p. ej., 24 horas antes)</li>
                <li>Notificar cambios o cancelaciones realizados por el negocio</li>
                <li>Mantener el historial de servicios recibidos</li>
                <li>Procesar pagos cuando aplique (a traves de pasarelas externas)</li>
                <li>Verificar identidad para el ejercicio de derechos ARCO</li>
                <li>Cumplir obligaciones legales y fiscales</li>
              </ul>
            </div>

            <div className="mb-5">
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Bell size={16} className="text-purple-400" />
                Finalidades que requieren consentimiento previo, expreso e informado
              </h3>
              <ul className="list-disc list-inside text-zinc-300 space-y-1">
                <li>Enviar promociones, ofertas especiales y descuentos por email, SMS o WhatsApp</li>
                <li>Enviar novedades, noticias y contenido del negocio</li>
                <li>Campanas de marketing y retencion de clientes</li>
              </ul>
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <p className="text-sm text-zinc-300">
                <strong className="text-white">Importante:</strong> Puedes optar por NO recibir comunicaciones
                de marketing y seguir usando todos los servicios de reserva y gestion de citas sin ninguna
                restriccion. El consentimiento de marketing es completamente voluntario e independiente del
                servicio principal.
              </p>
            </div>
          </section>

          {/* --- 4. Con quien compartimos tus datos --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              4. Destinatarios y transferencias de datos
            </h2>
            <p className="text-zinc-300 mb-4">
              <strong className="text-white">NO vendemos, arrendamos ni cedemos tu informacion personal a terceros</strong> para
              fines propios de dichos terceros. Compartimos datos unicamente con los proveedores de servicios
              estrictamente necesarios para operar la Plataforma, bajo obligaciones contractuales de
              confidencialidad y seguridad:
            </p>

            <div className="bg-white/5 border border-white/10 rounded-lg divide-y divide-white/10 mb-4">
              <div className="p-4">
                <p className="text-sm text-white font-medium">Proveedor de correo electronico (Gmail SMTP)</p>
                <p className="text-xs text-zinc-500">Envio de confirmaciones, recordatorios y comunicaciones transaccionales.</p>
              </div>
              <div className="p-4">
                <p className="text-sm text-white font-medium">WhatsApp Business API (Meta Platforms)</p>
                <p className="text-xs text-zinc-500">Envio de confirmaciones y recordatorios por WhatsApp, unicamente si el negocio lo tiene habilitado.</p>
              </div>
              <div className="p-4">
                <p className="text-sm text-white font-medium">Proveedor de hosting (infraestructura en la nube)</p>
                <p className="text-xs text-zinc-500">Almacenamiento y procesamiento seguro de la aplicacion.</p>
              </div>
              <div className="p-4">
                <p className="text-sm text-white font-medium">MongoDB Atlas (MongoDB, Inc.)</p>
                <p className="text-xs text-zinc-500">Base de datos en la nube donde se almacenan los datos de usuarios, citas y configuraciones.</p>
              </div>
              <div className="p-4">
                <p className="text-sm text-white font-medium">Procesadores de pago (Wompi / Stripe)</p>
                <p className="text-xs text-zinc-500">Solo si el negocio cobra a traves de la plataforma. Nexus NO almacena numeros de tarjetas, CVV ni datos financieros directos; estos son procesados exclusivamente por el proveedor de pago.</p>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Globe size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-white font-medium mb-1">Transferencias internacionales</p>
                  <p className="text-xs text-zinc-400">
                    Algunos de los proveedores mencionados pueden almacenar o procesar datos fuera de Colombia
                    (p. ej., servidores en Estados Unidos). Estas transferencias se realizan en cumplimiento del
                    articulo 26 de la Ley 1581 de 2012 y bajo las garantias contractuales de cada proveedor.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* --- 5. Derechos ARCO --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              5. Tus derechos como titular (ARCO)
            </h2>
            <p className="text-zinc-300 mb-4">
              De conformidad con la Ley 1581 de 2012, tienes los siguientes derechos sobre tus datos personales.
              Para ejercerlos, inicia sesion en tu <strong className="text-white">Portal de Cliente</strong> con
              tu numero de telefono y PIN (esto verifica tu identidad). Si no tienes PIN, puedes crear uno gratis,
              o escribirnos directamente al correo de contacto indicado al final de esta Politica.
            </p>

            <div className="grid gap-4 mb-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Acceso (Consulta)</h3>
                <p className="text-sm text-zinc-400">
                  Conocer y obtener copia de los datos personales que tenemos almacenados sobre ti.
                  Puedes hacerlo desde la seccion "Mis Datos" de tu Portal de Cliente.
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Rectificacion (Correccion)</h3>
                <p className="text-sm text-zinc-400">
                  Actualizar o corregir datos inexactos, incompletos o desactualizados (nombre, correo electronico).
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Cancelacion (Supresion)</h3>
                <p className="text-sm text-zinc-400 mb-2">
                  Solicitar la eliminacion de tus datos personales cuando no exista obligacion legal o
                  contractual que justifique su conservacion.
                </p>
                <p className="text-xs text-zinc-500">
                  Plazo de respuesta: maximo 15 dias habiles desde la recepcion de la solicitud.
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2">Oposicion (Revocacion del consentimiento)</h3>
                <p className="text-sm text-zinc-400 mb-2">
                  Revocar en cualquier momento tu consentimiento para el tratamiento de datos con finalidades de marketing.
                  Puedes hacerlo a traves del link de cancelacion incluido en cada comunicacion de marketing, o
                  contactandonos directamente.
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <h3 className="text-base font-semibold text-white mb-2">Procedimiento para consultas y reclamos</h3>
              <div className="text-sm text-zinc-400 space-y-2">
                <p><strong className="text-white">Consultas:</strong> Se responderan en un plazo maximo de diez (10) dias habiles contados a partir de la fecha de recepcion. Cuando no fuere posible atender la consulta dentro de dicho termino, se informara al interesado antes de su vencimiento, expresando los motivos de la demora, y se senalara la fecha en que se atendera, la cual no podra superar los cinco (5) dias habiles siguientes.</p>
                <p><strong className="text-white">Reclamos:</strong> Se responderan en un plazo maximo de quince (15) dias habiles contados a partir del dia siguiente a la recepcion. Cuando no fuere posible atender el reclamo dentro de dicho termino, se informara al interesado los motivos de la demora y la fecha en que se atendera, la cual no podra superar los ocho (8) dias habiles siguientes.</p>
                <p><strong className="text-white">Canal:</strong> nexusbycs2@gmail.com o al telefono +57 310 370 5753.</p>
              </div>
            </div>
          </section>

          {/* --- 6. Cumplimiento legal --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              6. Cumplimiento legal por jurisdiccion
            </h2>

            <div className="grid gap-4 mb-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <span>Colombia</span>
                </h3>
                <div className="text-sm text-zinc-400 space-y-2">
                  <p><strong className="text-white">Ley 1581 de 2012 (Habeas Data):</strong> Solicitamos tu autorizacion previa, expresa e informada antes de usar tus datos para fines de marketing. Respetamos tus derechos ARCO y contamos con mecanismos para que los ejerzas de manera efectiva.</p>
                  <p><strong className="text-white">Autoridad de vigilancia:</strong> Superintendencia de Industria y Comercio (SIC), www.sic.gov.co, linea gratuita 018000 910165. Si consideras que hemos vulnerado tus derechos como titular de datos, puedes presentar una queja ante la SIC.</p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <span>Estados Unidos (Florida)</span>
                </h3>
                <div className="text-sm text-zinc-400 space-y-2">
                  <p><strong className="text-white">TCPA:</strong> Solo enviamos mensajes automaticos (SMS/WhatsApp) si otorgaste consentimiento explicito previo. Puedes cancelar en cualquier momento respondiendo "STOP" o usando los mecanismos de baja indicados en cada mensaje.</p>
                  <p><strong className="text-white">CAN-SPAM Act:</strong> Todos los correos de marketing incluyen un enlace funcional de cancelacion de suscripcion, la direccion fisica del negocio, e identificacion clara del remitente. Procesamos las solicitudes de baja en un plazo no superior a 10 dias habiles.</p>
                  <p><strong className="text-white">FIPA:</strong> En caso de una brecha de seguridad que afecte datos personales, notificaremos a los individuos afectados y, cuando aplique, a las autoridades de Florida en los plazos establecidos por la ley.</p>
                </div>
              </div>
            </div>
          </section>

          {/* --- 7. Seguridad de datos --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              7. Medidas de seguridad
            </h2>
            <p className="text-zinc-300 mb-4">
              Implementamos medidas tecnicas, humanas y administrativas razonables para proteger los datos
              personales contra acceso no autorizado, perdida, alteracion o divulgacion, incluyendo:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-2">
              <li>Encriptacion de contrasenas mediante algoritmo bcrypt (nunca almacenamos contrasenas en texto plano)</li>
              <li>Cookies de sesion configuradas como httpOnly y secure</li>
              <li>Encabezados de seguridad HTTP (Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options)</li>
              <li>Politica CORS restrictiva que limita los origenes autorizados</li>
              <li>Control de acceso basado en roles (owner, manager, staff) con aislamiento de datos por organizacion</li>
              <li>Conexiones cifradas mediante TLS/HTTPS en transito</li>
            </ul>
          </section>

          {/* --- 8. Retencion de datos --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              8. Retencion y eliminacion de datos
            </h2>
            <div className="bg-white/5 border border-white/10 rounded-lg divide-y divide-white/10">
              <div className="p-4 flex justify-between items-start gap-4">
                <div>
                  <p className="text-sm text-white font-medium">Datos de cuenta activa</p>
                  <p className="text-xs text-zinc-500">Datos de perfil, preferencias, configuracion</p>
                </div>
                <span className="text-xs text-zinc-400 whitespace-nowrap">Mientras la cuenta este activa</span>
              </div>
              <div className="p-4 flex justify-between items-start gap-4">
                <div>
                  <p className="text-sm text-white font-medium">Historial de citas y transacciones</p>
                  <p className="text-xs text-zinc-500">Registros con valor contable o fiscal</p>
                </div>
                <span className="text-xs text-zinc-400 whitespace-nowrap">Segun obligacion legal aplicable</span>
              </div>
              <div className="p-4 flex justify-between items-start gap-4">
                <div>
                  <p className="text-sm text-white font-medium">Datos de consentimiento de marketing</p>
                  <p className="text-xs text-zinc-500">Timestamp, IP, texto de autorizacion</p>
                </div>
                <span className="text-xs text-zinc-400 whitespace-nowrap">Hasta que revoques el consentimiento</span>
              </div>
              <div className="p-4 flex justify-between items-start gap-4">
                <div>
                  <p className="text-sm text-white font-medium">Solicitudes de eliminacion</p>
                  <p className="text-xs text-zinc-500">Procesamiento de la supresion de datos</p>
                </div>
                <span className="text-xs text-zinc-400 whitespace-nowrap">Max. 15 dias habiles</span>
              </div>
            </div>
            <p className="text-sm text-zinc-500 mt-3">
              Nota: Podemos retener ciertos datos anonimizados o agregados para fines estadisticos, asi como
              registros que deban conservarse por obligacion legal (contables, fiscales, de auditoria).
            </p>
          </section>

          {/* --- 9. Menores de edad --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              9. Tratamiento de datos de menores de edad
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus no esta disenado para recopilar datos de menores de catorce (14) anos. Si un menor de edad
              entre 14 y 18 anos utiliza la plataforma para reservar una cita, su uso debe contar con la
              autorizacion del representante legal, de conformidad con el articulo 12 del Decreto 1377 de 2013.
              Si detectamos que hemos recopilado datos de un menor sin la autorizacion requerida, procederemos
              a eliminarlos.
            </p>
          </section>

          {/* --- 10. Cookies y tecnologias similares --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              10. Cookies y tecnologias similares
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus utiliza cookies estrictamente necesarias para el funcionamiento de la plataforma
              (autenticacion de sesion, preferencias de idioma). No utilizamos cookies de rastreo publicitario
              ni herramientas de analisis de terceros que recopilen datos personales de navegacion. Las cookies
              de sesion se configuran como <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">httpOnly</code> y <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">secure</code>,
              lo que significa que no son accesibles desde JavaScript del cliente y solo se transmiten por
              conexiones cifradas.
            </p>
          </section>

          {/* --- 11. Cambios a esta politica --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              11. Modificaciones a esta Politica
            </h2>
            <p className="text-zinc-300 mb-4">
              Nos reservamos el derecho de actualizar esta Politica de Privacidad en cualquier momento para
              reflejar cambios en nuestras practicas o en la legislacion aplicable. Te notificaremos de
              cambios sustanciales mediante correo electronico o aviso visible dentro de la Plataforma con al
              menos quince (15) dias de anticipacion. La version vigente siempre estara disponible en esta
              pagina.
            </p>
          </section>

          {/* --- 12. Consentimiento --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              12. Autorizacion y consentimiento
            </h2>
            <p className="text-zinc-300 mb-4">
              Al utilizar Nexus by CS2 y proporcionar tus datos personales, declaras que:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-2">
              <li>Has leido y comprendido esta Politica de Privacidad.</li>
              <li>Autorizas el tratamiento de tus datos personales para las finalidades necesarias descritas en la seccion 3.</li>
              <li>Entiendes que puedes revocar tu consentimiento de marketing en cualquier momento, sin que ello afecte tu acceso a los servicios de la Plataforma.</li>
              <li>Conoces los mecanismos disponibles para ejercer tus derechos ARCO.</li>
            </ul>
          </section>
        </div>

        {/* Seccion de contacto */}
        <div className="mt-12 p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-2xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <FileText size={24} className="text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">
                Contacto del Responsable del Tratamiento
              </h3>
              <p className="text-zinc-300 text-sm mb-4">
                Para preguntas sobre esta politica, ejercer tus derechos ARCO, o presentar consultas o reclamos:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Mail size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Correo electronico</p>
                    <a href="mailto:nexusbycs2@gmail.com" className="text-blue-400 hover:underline text-sm">
                      nexusbycs2@gmail.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Telefono</p>
                    <a href="tel:+573103705753" className="text-blue-400 hover:underline text-sm">
                      +57 310 370 5753
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Direccion</p>
                    <p className="text-sm text-zinc-300">
                      Cr 51 #96 sur 50<br />
                      La Estrella, Antioquia, Colombia
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs text-zinc-500 mb-1">Responsable del Tratamiento</p>
                  <p className="text-sm text-white font-medium">Felipe Jaramillo Parra</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/PRIVACY_POLICY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline text-sm"
          >
            Descargar documento completo (formato texto) &rarr;
          </a>
        </div>
      </main>

      <footer className="border-t border-white/10 mt-12 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-zinc-500">
          <p>&copy; 2026 Nexus by CS2. Todos los derechos reservados.</p>
          <p className="mt-2">
            Cumplimos con la Ley 1581 de 2012 (Colombia), TCPA, CAN-SPAM Act y FIPA (Florida, EE.UU.)
          </p>
        </div>
      </footer>
    </div>
  );
}
