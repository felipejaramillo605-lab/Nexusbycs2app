import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, Phone, MapPin, AlertTriangle, Shield, Scale, Users, CreditCard, Ban, Clock, Gavel, RefreshCw, Database, BookOpen } from 'lucide-react';

export default function TermsOfService() {
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Terminos de Servicio</h1>
              <p className="text-xs text-zinc-400">Nexus by CS2 — para duenos y administradores de negocio</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="prose prose-invert max-w-none">

          {/* Banner de borrador */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-8 flex gap-3">
            <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-200 font-semibold mb-1">
                BORRADOR PENDIENTE DE REVISION LEGAL
              </p>
              <p className="text-sm text-amber-200/80">
                Este documento describe las condiciones bajo las que Felipe Jaramillo Parra ("Nexus by CS2")
                ofrece la plataforma a duenos y administradores de negocio. Antes de tratarlo como vinculante
                frente a terceros, debe ser revisado y aprobado por un abogado, especialmente para operacion
                en Colombia (Ley 1480 de 2011 — Estatuto del Consumidor, Codigo de Comercio) y, si aplica,
                en Florida, EE.UU.
              </p>
            </div>
          </div>

          {/* --- 1. Que es Nexus --- */}
          <section className="mb-8">
            <p className="text-sm text-zinc-400 mb-4">Ultima actualizacion: agosto de 2026</p>
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              1. Objeto y definiciones
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus by CS2 ("Nexus", "nosotros", "la Plataforma") es una plataforma de software como servicio
              (SaaS) desarrollada y operada por Felipe Jaramillo Parra, con domicilio en La Estrella, Antioquia,
              Colombia, disenada para la gestion integral de negocios de barberia y salon de belleza: agenda de
              citas, gestion de clientes, inventario, facturacion, comunicaciones y portal de reservas para
              clientes finales.
            </p>
            <p className="text-zinc-300 mb-4">
              Al crear una cuenta como dueno o administrador ("tu", "el Negocio", "el Usuario"), aceptas
              estos Terminos de Servicio (en adelante "los Terminos") en su totalidad. Si no estas de acuerdo
              con alguna de estas condiciones, no debes utilizar la Plataforma.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <h3 className="text-base font-semibold text-white mb-2">Definiciones clave</h3>
              <ul className="text-sm text-zinc-400 space-y-1">
                <li><strong className="text-white">Owner:</strong> persona que crea y es titular de una o mas organizaciones (establecimientos) en Nexus.</li>
                <li><strong className="text-white">Manager:</strong> persona designada por el Owner para administrar una organizacion.</li>
                <li><strong className="text-white">Staff / Profesional:</strong> persona registrada por el negocio como prestador de servicios (barbero, estilista, etc.).</li>
                <li><strong className="text-white">Cliente final:</strong> persona que reserva citas o utiliza el Portal del Cliente.</li>
                <li><strong className="text-white">Organizacion:</strong> cada establecimiento o sucursal registrada en Nexus.</li>
              </ul>
            </div>
          </section>

          {/* --- 2. Responsable vs Encargado --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              2. Roles en el tratamiento de datos personales
            </h2>
            <p className="text-zinc-300 mb-4">
              De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013 (Colombia):
            </p>
            <div className="grid gap-4 mb-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <Users size={18} className="text-purple-400" />
                  Tu (el Negocio) eres el Responsable del Tratamiento
                </h3>
                <p className="text-sm text-zinc-400">
                  Decides que datos de tus clientes finales se recopilan (nombre, telefono, historial de
                  citas) y para que los usas. Eres responsable de contar con base legal para tratarlos,
                  obtener las autorizaciones necesarias de tus clientes, y atender sus consultas y reclamos
                  sobre sus datos personales.
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <Database size={18} className="text-blue-400" />
                  Nexus es el Encargado del Tratamiento
                </h3>
                <p className="text-sm text-zinc-400">
                  Procesamos y almacenamos los datos de tus clientes en tu nombre, siguiendo las instrucciones
                  que nos das a traves del uso normal de la Plataforma. Aplicamos las medidas de seguridad
                  descritas en nuestra{' '}
                  <a href="/privacy-policy" className="text-purple-400 hover:underline">Politica de Privacidad</a>,
                  y no utilizaremos los datos de tus clientes para finalidades distintas a las necesarias para
                  prestarte el servicio.
                </p>
              </div>
            </div>
          </section>

          {/* --- 3. Cuenta y aprobacion --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              3. Registro, cuenta y aprobacion
            </h2>
            <p className="text-zinc-300 mb-4">
              Las cuentas nuevas de Owner o Manager quedan en estado "pendiente" hasta ser aprobadas por
              Nexus. El Usuario es responsable de:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-1 mb-4">
              <li>Proporcionar informacion veraz, completa y actualizada durante el registro.</li>
              <li>Mantener la confidencialidad de su contrasena y credenciales de acceso.</li>
              <li>Notificar de inmediato a Nexus ante cualquier uso no autorizado de su cuenta.</li>
              <li>Todas las actividades que se realicen bajo su cuenta.</li>
            </ul>
            <p className="text-zinc-300">
              Nexus se reserva el derecho de rechazar solicitudes de registro, suspender o cancelar cuentas
              ante uso indebido, fraude, impago, o incumplimiento de estos Terminos, previa notificacion al
              Usuario salvo en casos de urgencia o riesgo para la Plataforma.
            </p>
          </section>

          {/* --- 4. Suscripcion y pagos --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              4. Suscripcion, precios y pagos
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus puede ofrecer planes de suscripcion con diferentes niveles de funcionalidad. Las
              condiciones especificas de precio, ciclo de facturacion, periodo de prueba y cancelacion se
              mostraran en tu panel de "Suscripcion" antes de confirmar cualquier cobro.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
              <p className="text-sm text-zinc-400">
                <strong className="text-white">Procesamiento de pagos:</strong> Nexus NO almacena ni procesa
                directamente datos de tarjetas de credito o debito. Los cobros se gestionan a traves de
                proveedores externos certificados (Wompi, Stripe u otro indicado en el panel), sujetos a sus
                propios terminos de servicio y politicas de seguridad (PCI-DSS).
              </p>
              <p className="text-sm text-zinc-400">
                <strong className="text-white">Modificacion de precios:</strong> Nexus podra modificar los
                precios de las suscripciones notificandote con al menos treinta (30) dias de anticipacion.
                Si no aceptas el nuevo precio, podras cancelar tu suscripcion antes de que entre en vigor.
              </p>
            </div>
          </section>

          {/* --- 5. Uso aceptable --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              5. Uso aceptable y restricciones
            </h2>
            <p className="text-zinc-300 mb-4">
              Al utilizar Nexus, te comprometes a:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-1 mb-4">
              <li>Usar la Plataforma exclusivamente para la gestion legitima de tu negocio de barberia o salon.</li>
              <li>No enviar comunicaciones masivas no solicitadas (spam) a personas que no sean tus propios clientes con consentimiento vigente.</li>
              <li>No intentar vulnerar, evadir o probar la seguridad de la Plataforma sin autorizacion escrita previa de Nexus.</li>
              <li>No acceder ni intentar acceder a datos, organizaciones o cuentas que no te pertenezcan.</li>
              <li>No utilizar la Plataforma para actividades ilegales, fraudulentas o que infrinjan derechos de terceros.</li>
              <li>No realizar ingenieria inversa, descompilar o desensamblar el software de la Plataforma.</li>
              <li>Respetar los limites de uso razonable y no abusar de la infraestructura (p. ej., llamadas excesivas a la API).</li>
            </ul>
            <p className="text-sm text-zinc-400">
              El incumplimiento de estas restricciones puede resultar en la suspension o terminacion de tu
              cuenta, sin perjuicio de las acciones legales a que haya lugar.
            </p>
          </section>

          {/* --- 6. Propiedad intelectual --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              6. Propiedad intelectual y licencia de uso
            </h2>
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Propiedad de Nexus</h3>
                <p className="text-sm text-zinc-400">
                  El software, la interfaz, el diseno, el codigo fuente, los algoritmos, la documentacion y
                  todos los elementos que componen la Plataforma son propiedad exclusiva de Felipe Jaramillo
                  Parra o se utilizan bajo licencia legitima. Estos Terminos te otorgan una licencia limitada,
                  no exclusiva, no transferible y revocable para usar la Plataforma durante la vigencia de tu
                  suscripcion, exclusivamente para los fines descritos en estos Terminos.
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Propiedad del Negocio</h3>
                <p className="text-sm text-zinc-400">
                  Los datos que ingreses en la Plataforma (informacion de tu negocio, tus clientes, tus
                  profesionales, tus servicios, tu inventario) son y seguiran siendo de tu propiedad. Nexus
                  no adquiere ningun derecho sobre tus datos comerciales mas alla de lo necesario para
                  prestarte el servicio.
                </p>
              </div>
            </div>
          </section>

          {/* --- 7. Aislamiento y confidencialidad --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              7. Aislamiento de datos y confidencialidad
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus es una plataforma multi-inquilino (multi-tenant). Cada Organizacion opera de forma
              aislada: los datos de un negocio no son visibles ni accesibles para otros negocios de la
              Plataforma. Implementamos controles de acceso a nivel de aplicacion y base de datos para
              garantizar este aislamiento.
            </p>
            <p className="text-zinc-300">
              Nexus se compromete a tratar como confidencial toda la informacion comercial del Negocio
              (precios, configuracion de servicios, datos financieros, metricas de rendimiento) y a no
              divulgarla a terceros, salvo por requerimiento de autoridad competente.
            </p>
          </section>

          {/* --- 8. Disponibilidad --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              8. Disponibilidad del servicio
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus se esfuerza por mantener la Plataforma disponible de forma continua. Sin embargo, no
              garantizamos una disponibilidad del 100% y el servicio puede experimentar interrupciones por:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-1 mb-4">
              <li>Mantenimiento programado (se notificara con anticipacion razonable cuando sea posible).</li>
              <li>Actualizaciones de seguridad urgentes.</li>
              <li>Causas de fuerza mayor o caso fortuito.</li>
              <li>Fallas de terceros proveedores de infraestructura.</li>
            </ul>
            <p className="text-sm text-zinc-400">
              Nexus no sera responsable por danos derivados de interrupciones temporales del servicio, pero
              se compromete a comunicar de forma oportuna las incidencias relevantes y a restaurar el
              servicio en el menor tiempo posible.
            </p>
          </section>

          {/* --- 9. Limitacion de responsabilidad --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              9. Limitacion de responsabilidad
            </h2>
            <p className="text-zinc-300 mb-4">
              La Plataforma se ofrece "tal cual" (<em>as is</em>) y "segun disponibilidad" (<em>as available</em>).
              En la maxima medida permitida por la legislacion colombiana aplicable:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-2 mb-4">
              <li>Nexus no sera responsable por danos indirectos, incidentales, especiales o consecuenciales derivados del uso o la imposibilidad de uso de la Plataforma (incluyendo, sin limitacion, lucro cesante, perdida de datos o interrupcion del negocio).</li>
              <li>La responsabilidad total acumulada de Nexus frente al Usuario, por cualquier causa y bajo cualquier teoria de responsabilidad, no excedera el valor total pagado por el Usuario a Nexus durante los doce (12) meses inmediatamente anteriores al hecho que dio origen al reclamo.</li>
              <li>Nexus no se hace responsable del contenido ingresado por los Usuarios, ni de las relaciones comerciales entre el Negocio y sus clientes finales.</li>
            </ul>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-sm text-amber-200">
                <strong>Nota para revision legal:</strong> Esta clausula debe ajustarse con asesoria de
                abogado para asegurar su validez y ejecutabilidad bajo el derecho colombiano (en particular,
                el articulo 1604 del Codigo Civil y el Estatuto del Consumidor, Ley 1480 de 2011).
              </p>
            </div>
          </section>

          {/* --- 10. Indemnizacion --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              10. Indemnizacion
            </h2>
            <p className="text-zinc-300 mb-4">
              El Usuario se compromete a mantener indemne a Nexus, su titular, y sus colaboradores frente a
              cualquier reclamacion, demanda, dano, costo o gasto (incluyendo honorarios razonables de
              abogados) que surja de:
            </p>
            <ul className="list-disc list-inside text-zinc-300 space-y-1">
              <li>El incumplimiento de estos Terminos por parte del Usuario.</li>
              <li>El uso indebido de la Plataforma.</li>
              <li>La violacion de derechos de terceros por parte del Usuario.</li>
              <li>El incumplimiento de la normativa de proteccion de datos por parte del Usuario en su calidad de Responsable del Tratamiento.</li>
            </ul>
          </section>

          {/* --- 11. Terminacion --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              11. Terminacion y portabilidad de datos
            </h2>
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Terminacion por el Usuario</h3>
                <p className="text-sm text-zinc-400">
                  Puedes dejar de usar Nexus y solicitar la cancelacion de tu cuenta en cualquier momento.
                  Si tienes una suscripcion activa, esta se mantendra hasta el final del periodo ya pagado.
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Terminacion por Nexus</h3>
                <p className="text-sm text-zinc-400">
                  Nexus puede suspender o terminar tu cuenta por incumplimiento de estos Terminos, impago
                  reiterado, o uso indebido, previa notificacion y oportunidad de subsanacion (excepto en
                  casos que requieran accion inmediata por riesgo de seguridad o fraude).
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h3 className="text-base font-semibold text-white mb-2">Portabilidad de datos</h3>
                <p className="text-sm text-zinc-400">
                  Al finalizar la relacion, tienes derecho a solicitar una copia de tus datos comerciales
                  (clientes, citas, servicios, configuraciones) en formato estandar antes de la eliminacion
                  de tu cuenta. Los datos se conservaran segun lo indicado en nuestra{' '}
                  <a href="/privacy-policy" className="text-purple-400 hover:underline">Politica de Privacidad</a>,
                  incluyendo la retencion de registros con obligaciones contables o fiscales.
                </p>
              </div>
            </div>
          </section>

          {/* --- 12. Modificaciones --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              12. Modificaciones a estos Terminos
            </h2>
            <p className="text-zinc-300 mb-4">
              Nexus se reserva el derecho de modificar estos Terminos en cualquier momento. Te notificaremos
              de cambios sustanciales con al menos treinta (30) dias de anticipacion mediante correo
              electronico o aviso dentro de la Plataforma. El uso continuado de la Plataforma despues de la
              entrada en vigencia de los cambios constituye aceptacion de los Terminos modificados. Si no
              estas de acuerdo con las modificaciones, podras cancelar tu cuenta antes de que entren en vigor.
            </p>
          </section>

          {/* --- 13. Resolucion de disputas --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              13. Ley aplicable y resolucion de disputas
            </h2>
            <p className="text-zinc-300 mb-4">
              Estos Terminos se rigen e interpretan de acuerdo con las leyes de la Republica de Colombia.
            </p>
            <p className="text-zinc-300 mb-4">
              Cualquier controversia derivada de estos Terminos se resolvera preferiblemente de manera directa
              entre las partes. En caso de no llegar a un acuerdo, las partes podran acudir a un mecanismo
              alternativo de solucion de conflictos (conciliacion o mediacion) ante un centro de conciliacion
              autorizado en Colombia, antes de iniciar acciones judiciales ante los jueces competentes del
              domicilio del demandado.
            </p>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm text-zinc-300">
                <strong className="text-white">Expansion a Florida (EE.UU.):</strong> Si la operacion de
                Nexus se expande a Florida, se comunicaran condiciones adicionales especificas para esa
                jurisdiccion antes del lanzamiento. La operacion en EE.UU. estara sujeta a revision legal
                previa.
              </p>
            </div>
          </section>

          {/* --- 14. Disposiciones generales --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              14. Disposiciones generales
            </h2>
            <ul className="list-disc list-inside text-zinc-300 space-y-2">
              <li><strong className="text-white">Totalidad del acuerdo:</strong> Estos Terminos, junto con la Politica de Privacidad, constituyen la totalidad del acuerdo entre tu y Nexus respecto al uso de la Plataforma.</li>
              <li><strong className="text-white">Divisibilidad:</strong> Si alguna clausula de estos Terminos fuera declarada invalida o inexigible, las demas clausulas mantendran su plena vigencia y efecto.</li>
              <li><strong className="text-white">No renuncia:</strong> La falta de ejercicio por parte de Nexus de cualquier derecho previsto en estos Terminos no constituye renuncia al mismo.</li>
              <li><strong className="text-white">Cesion:</strong> El Usuario no podra ceder ni transferir su cuenta ni los derechos y obligaciones derivados de estos Terminos sin el consentimiento previo y escrito de Nexus.</li>
              <li><strong className="text-white">Fuerza mayor:</strong> Nexus no sera responsable del incumplimiento de sus obligaciones cuando este sea causado por eventos de fuerza mayor o caso fortuito, conforme al articulo 64 del Codigo Civil colombiano.</li>
            </ul>
          </section>

          {/* --- 15. Contacto --- */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-white border-b border-white/10 pb-2">
              15. Contacto
            </h2>
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-purple-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500">Correo</p>
                  <a href="mailto:nexusbycs2@gmail.com" className="text-sm text-purple-400 hover:underline">nexusbycs2@gmail.com</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-purple-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500">Telefono</p>
                  <a href="tel:+573103705753" className="text-sm text-purple-400 hover:underline">+57 310 370 5753</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-purple-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500">Direccion</p>
                  <p className="text-sm text-zinc-300">Cr 51 #96 sur 50, La Estrella, Antioquia, Colombia</p>
                </div>
              </div>
              <div className="pt-3 border-t border-white/10">
                <p className="text-xs text-zinc-500">Titular</p>
                <p className="text-sm text-white font-medium">Felipe Jaramillo Parra</p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/10 mt-12 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-zinc-500">
          <p>&copy; 2026 Nexus by CS2. Todos los derechos reservados.</p>
          <div className="mt-2 flex justify-center gap-4">
            <a href="/privacy-policy" className="hover:text-zinc-300 transition-colors">Politica de Privacidad</a>
            <span>&middot;</span>
            <a href="/terms-of-service" className="hover:text-zinc-300 transition-colors">Terminos de Servicio</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
