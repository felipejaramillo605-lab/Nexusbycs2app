import { Building2, Download, RefreshCw, ShieldCheck, ShieldQuestion, UserCheck, UserPlus, ChevronRight } from 'lucide-react';

const owner = {
  summary: {
    what: 'La consola del Owner reúne la administración global de organizaciones, facturas, accesos y permisos, junto con los registros de auditoría y seguridad.',
    forWhat: 'Permite localizar una organización, revisar su facturación, administrar cuentas y sesiones, delegar el permiso para gestionar Premium y consultar los cambios registrados en la plataforma.',
    whoUses: 'Solo el Owner. Estas páginas abarcan todas las organizaciones y son distintas de la operación diaria del Manager y del equipo.',
  },
  screens: [
    {
      title: 'Matriz de terceros',
      screenshot: { src: null, alt: 'Directorio global con búsqueda, estado fiscal, paginación y detalle lateral de una organización: campos pendientes, personas, suscripción y Paquete Premium.' },
      zones: [
        { n: 1, label: 'Búsqueda y estado fiscal', desc: 'busca por nombre, razón social, NIT, correo, ciudad o ID y filtra completos o incompletos', xPct: 40, yPct: 35 },
        { n: 2, label: 'Ver detalle', desc: 'consulta información fiscal, personas vinculadas y estados de la organización', xPct: 88, yPct: 55 },
        { n: 3, label: 'Nueva organización', desc: 'abre el flujo de creación de una organización', xPct: 75, yPct: 12 },
      ],
    },
    {
      title: 'Facturas globales',
      screenshot: { src: null, alt: 'Resumen global de cartera y tabla de facturas de todas las organizaciones, con búsqueda, filtros de estado y tipo, botón PDF y paginación.' },
      zones: [
        { n: 1, label: 'Resumen de cartera', desc: 'muestra saldos y facturas pendientes globales cuando el resumen está disponible', xPct: 50, yPct: 25 },
        { n: 2, label: 'Búsqueda y filtros', desc: 'localiza organización o número de factura y combina estado con tipo', xPct: 45, yPct: 40 },
        { n: 3, label: 'PDF', desc: 'descarga la factura desde su fila en la tabla', xPct: 90, yPct: 60 },
      ],
    },
    {
      title: 'Control de accesos',
      screenshot: { src: null, alt: 'Usuarios con búsqueda y filtros de acceso; el detalle lateral muestra rol, organización, acciones de acceso y sesiones activas. Los cambios de vinculación y rol se hacen en un modal.' },
      zones: [
        { n: 1, label: 'Buscar y filtrar usuarios', desc: 'busca nombre, correo, rol o ID de organización y filtra por estado', xPct: 40, yPct: 35 },
        { n: 2, label: 'Ver', desc: 'abre el detalle del usuario para comprobar su identidad y administrar el acceso', xPct: 90, yPct: 52 },
        { n: 3, label: 'Administrar vinculación y rol', desc: 'disponible para cuentas que no sean Owner; requiere organización, rol y motivo', xPct: 80, yPct: 58 },
        { n: 4, label: 'Sesiones activas', desc: 'muestra fechas de creación y vencimiento; permite cerrar todas las sesiones de otro usuario si tiene sesiones activas', xPct: 80, yPct: 80 },
      ],
    },
    {
      title: 'Administradores de entitlements',
      screenshot: { src: null, alt: 'Formulario para otorgar el permiso Premium a un Owner elegible, lista Con permiso activo e Historial de auditoría. Revocar solo aparece si hay más de un titular.' },
      zones: [
        { n: 1, label: 'Otorgar permiso', desc: 'selecciona un Owner aprobado y escribe el motivo', xPct: 45, yPct: 30 },
        { n: 2, label: 'Con permiso activo', desc: 'muestra titulares, fecha y motivo; permite revocar conservando al menos un administrador', xPct: 45, yPct: 58 },
        { n: 3, label: 'Historial de auditoría', desc: 'consulta otorgamientos y revocaciones con sus motivos', xPct: 45, yPct: 83 },
      ],
    },
    {
      title: 'Registro de auditoría',
      screenshot: { src: null, alt: 'Línea de tiempo de solo lectura con categorías de cuentas, facturación, perfil fiscal y permisos; tabla con evento, entidad, organización, actor, motivo y fecha.' },
      zones: [
        { n: 1, label: 'Categorías', desc: 'acota el registro al dominio que necesitas investigar', xPct: 50, yPct: 28 },
        { n: 2, label: 'Eventos registrados', desc: 'relaciona entidad, actor, motivo y fecha en la tabla', xPct: 50, yPct: 55 },
        { n: 3, label: 'Anterior / Siguiente', desc: 'recorre las páginas del registro filtrado', xPct: 85, yPct: 90 },
      ],
    },
    {
      title: 'Eventos de seguridad',
      screenshot: { src: null, alt: 'Registro de seguridad de solo lectura con resumen de eventos y ocurrencias, filtros de tipo y severidad, y tabla de ruta, origen anonimizado, última vez y código diagnóstico.' },
      zones: [
        { n: 1, label: 'Eventos y ocurrencias', desc: 'distingue eventos distintos de la cantidad de veces que ocurrieron', xPct: 50, yPct: 25 },
        { n: 2, label: 'Tipo y severidad', desc: 'filtra bloqueos o límites de intentos y selecciona Advertencia o Alta', xPct: 50, yPct: 40 },
        { n: 3, label: 'Registro de seguridad', desc: 'consulta método, ruta, huella de origen, ocurrencias y código en la tabla', xPct: 50, yPct: 63 },
      ],
    },
    {
      title: 'Reporte de integridad',
      screenshot: { src: null, alt: 'Reporte de solo lectura con hallazgos totales y por dominio (reservas, facturación, inventario), filtro de dominio y tabla con dominio, hallazgo, organización, entidad y detalle.' },
      zones: [
        { n: 1, label: 'Hallazgos por dominio', desc: 'muestra el total y el desglose en reservas, facturación e inventario', xPct: 50, yPct: 22 },
        { n: 2, label: 'Filtro de dominio', desc: 'acota la tabla a un solo dominio o vuelve a todos', xPct: 50, yPct: 40 },
        { n: 3, label: 'Tabla de hallazgos', desc: 'detalla qué referencia quedó huérfana y a qué entidad y organización pertenece', xPct: 50, yPct: 62 },
        { n: 4, label: 'Actualizar', desc: 'vuelve a calcular el reporte en el momento', xPct: 88, yPct: 12 },
      ],
    },
  ],
  steps: [
    {
      id: 'oc1', title: 'Localizar y revisar una organización',
      substeps: [
        'Abre /owner/organizations para entrar a "Matriz de terceros".',
        'Escribe el nombre, NIT u otro dato admitido en la búsqueda y pulsa Enter. Usa "Completos" o "Incompletos" para acotar el estado fiscal.',
        'Pulsa "Ver detalle" o el nombre de la organización. Revisa identificación, campos pendientes, personas vinculadas, Suscripción, Acceso y Paquete Premium.',
        'Si necesitas corregir datos fiscales, pulsa "Editar información fiscal". "Gestionar suscripción y acceso" y "Ver Plan Premium" llevan a /owner/billing, donde debes localizar la organización correspondiente.',
        'Usa "Anterior" y "Siguiente" para recorrer resultados o "Actualizar" para recargar. "Nueva organización" abre el alta de una organización.',
      ],
      expected: 'Identificas la organización y sus pendientes. Los indicadores de completos, incompletos y personas visibles corresponden a la página actual, no a toda la plataforma.',
    },
    {
      id: 'oc2', title: 'Consultar una factura entre todas las organizaciones',
      substeps: [
        'Abre /owner/billing/invoices, "Facturas globales".',
        'Busca organización o número de factura y pulsa Enter. Combina el estado con "Excedente Premium" si corresponde; vuelve a "Todos los tipos" para ampliar la consulta.',
        'Comprueba organización, número, valor, vencimiento y estado. Usa la paginación para ver más resultados.',
        'En la tabla, pulsa "PDF" en la fila correcta para descargarla. Si estás viendo tarjetas en una pantalla estrecha, amplía la ventana para acceder a la tabla y su botón PDF.',
        'Para gestionar pagos, anulaciones o reembolsos, abre /owner/billing y administra la organización correspondiente; la lista global es de consulta.',
      ],
      expected: 'Encuentras la factura y, desde la tabla, puedes descargar su PDF. Los indicadores superiores son un resumen global de cartera y no se recalculan con los filtros de la lista.',
    },
    {
      id: 'oc3', title: 'Revisar y aprobar el acceso de una cuenta',
      substeps: [
        'Abre /owner/access, "Control de accesos", y filtra "Pendientes" o busca por correo.',
        'Pulsa "Ver" y comprueba usuario, rol, estado y organización antes de actuar.',
        'Usa "Aprobar acceso" para autorizar la cuenta o "Rechazar" cuando corresponda. También puedes usar "Aprobar" desde la tabla.',
        'Al aprobar un Manager o Administrador sin organización, el flujo continúa en el alta de organización. Si ya estaba aprobado, usa "Continuar y crear organización" en su detalle.',
      ],
      expected: 'El acceso queda actualizado. Aprobar un Manager sin organización requiere continuar con la creación de su organización.',
    },
    {
      id: 'oc4', title: 'Corregir vinculación y rol',
      substeps: [
        'En /owner/access, abre el detalle de una cuenta que no sea Owner y pulsa "Administrar vinculación y rol".',
        'Selecciona la organización y el nuevo rol: Manager, Administrador o Profesional del equipo.',
        'Escribe un motivo de entre 10 y 500 caracteres y lee "Impacto previsto". El cambio cierra sesiones; para Profesional se crea o reactiva el perfil, mientras que para Manager o Administrador se inactiva el perfil profesional para nuevas citas y se conserva el historial.',
        'Revisa los datos y pulsa "Aplicar vinculación y rol". Si la cuenta cambió en otra sesión, recarga y vuelve a comprobarla.',
      ],
      expected: 'La vinculación y el rol se actualizan de forma auditada. Esta operación no modifica cuentas Owner.',
    },
    {
      id: 'oc5', title: 'Consultar y cerrar sesiones de otro usuario',
      substeps: [
        'En /owner/access, pulsa "Ver" para abrir el usuario y espera a que cargue "Sesiones activas".',
        'Revisa las fechas de creación y vencimiento. Si aparece el aviso de más sesiones activas, la lista muestra solo las más recientes.',
        'Para otro usuario con sesiones activas, escribe un motivo de entre 10 y 500 caracteres y pulsa "Cerrar todas las sesiones".',
        'Comprueba el aviso con el número de sesiones cerradas y que el contador quede en cero.',
      ],
      expected: 'Se cierran todas las sesiones del usuario seleccionado, incluidas las que no aparecían en la lista resumida. El control está oculto en tu propia cuenta y cuando hay cero sesiones activas.',
    },
    {
      id: 'oc6', title: 'Delegar o retirar el permiso de administrar Premium',
      substeps: [
        'Abre /owner/capability-grants, "Administradores de entitlements", en IT y auditoría.',
        'En "Otorgar permiso", selecciona un Owner aprobado disponible y escribe el motivo. El selector excluye cuentas inactivas, eliminadas y titulares que ya tienen el permiso.',
        'Pulsa "Otorgar permiso" y comprueba "Con permiso activo" e "Historial de auditoría".',
        'Para retirar el permiso, escribe "Motivo de la revocación" junto al titular, pulsa "Revocar" y confirma. Debe quedar al menos un titular: si solo queda uno, no aparecen los controles de revocación.',
      ],
      expected: 'Cambia quién puede activar o desactivar el paquete Premium de una organización. Otorgar este permiso no activa Premium para ninguna organización; esa gestión se realiza en Suscripciones.',
    },
    {
      id: 'oc7', title: 'Investigar un cambio administrativo',
      substeps: [
        'Abre /owner/audit-log, "Registro de auditoría", en IT y auditoría.',
        'Selecciona "Cuentas de usuario", "Facturación", "Perfil fiscal" o "Permisos de plataforma", o conserva "Todas las categorías".',
        'En la tabla, revisa evento, entidad, organización, actor, motivo y fecha. En pantallas estrechas las tarjetas muestran menos campos; amplía la ventana si necesitas el detalle de la tabla.',
        'Recorre "Anterior" y "Siguiente". Al cambiar la categoría vuelves a la primera página.',
      ],
      expected: 'Puedes rastrear los cambios registrados. El registro es estrictamente de solo lectura: no permite editar, borrar ni deshacer eventos.',
    },
    {
      id: 'oc8', title: 'Revisar bloqueos y alertas de seguridad',
      substeps: [
        'Abre /owner/security-events, "Eventos de seguridad", en IT y auditoría.',
        'Filtra por origen bloqueado, solicitud entre sitios bloqueada, límite de intentos de autenticación o acceso entre organizaciones bloqueado. Combina con "Advertencia" o "Alta".',
        'Revisa tipo, severidad, ruta, ocurrencias y última vez. En la tabla también puedes consultar Origen y Código; amplía la ventana si ves tarjetas resumidas.',
        'Usa "Anterior" y "Siguiente" y conserva el código y la ruta para investigar el caso con el equipo responsable.',
      ],
      expected: 'Consultas eventos de protección ya registrados, sin modificar políticas ni desbloquear solicitudes. Origen muestra una huella anonimizada, no un nombre, correo o IP.',
    },
    {
      id: 'oc9', title: 'Revisar referencias huérfanas entre reservas, facturación e inventario',
      substeps: [
        'Abre /owner/integrity-report, "Reporte de integridad", en IT y auditoría.',
        'Revisa "Hallazgos totales" y el desglose por dominio para ubicar dónde hay más pendientes.',
        'Filtra por "Reservas y citas", "Facturación" o "Inventario/compras" para enfocarte en un dominio, o conserva "Todos los dominios".',
        'En la tabla, identifica el tipo de hallazgo, la organización, la entidad afectada y el detalle de qué referencia no existe.',
        'Pulsa "Actualizar" si acabas de corregir datos y quieres confirmar que el hallazgo ya no aparece.',
      ],
      expected: 'Detectas registros que apuntan a algo que ya no existe (una clase, un profesional, una organización, un proveedor o una orden de compra). El reporte solo informa: la corrección se hace desde la página dueña de ese dato, no desde aquí.',
    },
    {
      id: 'oc10', title: 'Ver una cuenta de organización sin modificarla',
      substeps: ['En Directorio, elige la organización y pulsa "Ver cuenta (solo lectura)".', 'Escribe el motivo de soporte; la sesión dura 30 minutos.', 'Consulta las pantallas Manager necesarias y usa "Salir" al terminar.'],
      expected: 'La sesión solo permite lecturas de esa organización; exportaciones y cambios quedan bloqueados y el Owner conserva la auditoría.',
    },
    {
      id: 'oc11', title: 'Agregar un Owner por correo',
      substeps: ['En Control de accesos, abre "Agregar Owner" e ingresa el correo y el motivo de la asignación.', 'Si el correo ya pertenece a una cuenta aprobada, confirma la promoción. Si no existe, se crea una invitación de 14 días.', 'La invitación solo se consume cuando esa persona inicia sesión con Google y usa exactamente el correo invitado.'],
      expected: 'La cuenta existente queda promovida o la invitación queda pendiente, siempre con motivo auditado.',
    },
    {
      id: 'oc12', title: 'Eliminar una organización conservando sus registros',
      substeps: ['Desde el Directorio, abre "Eliminar organización" y revisa el impacto informado.', 'Escribe el nombre exacto de la organización y un motivo antes de confirmar.', 'Si existe una cuenta Owner vinculada, corrige esa vinculación primero; la eliminación se bloquea hasta resolverla.'],
      expected: 'La organización se archiva, sus miembros pierden acceso y los registros se conservan para auditoría.',
    },
    {
      id: 'oc13', title: 'Copiar medios al almacenamiento durable',
      substeps: ['Abre "Integridad de medios" en IT y auditoría.', 'Pulsa "Copiar medios a almacenamiento durable" y confirma la operación.', 'Revisa los contadores de copiados y errores. Si aparece "Almacenamiento durable no configurado", solicita al equipo técnico configurar R2 antes de reintentar.'],
      expected: 'Las copias existentes se preservan y los medios disponibles se copian al almacenamiento durable.',
    },
  ],
  buttons: [
    { icon: Building2, name: 'Ver detalle', does: 'Abre el detalle de una organización en Matriz de terceros.', when: 'Para comprobar datos fiscales, personas y estados.' },
    { icon: RefreshCw, name: 'Actualizar', does: 'Recarga Matriz de terceros, Control de accesos o Administradores de entitlements.', when: 'Después de cambios que puedan haberse realizado en otra sesión.' },
    { icon: Download, name: 'PDF', does: 'Descarga la factura de la fila de la tabla global.', when: 'Cuando ya comprobaste la organización y el número.' },
    { icon: UserCheck, name: 'Aprobar acceso / Rechazar', does: 'Cambia el estado de acceso del usuario.', when: 'Tras verificar su identidad, rol y organización.' },
    { icon: ShieldCheck, name: 'Aplicar vinculación y rol', does: 'Guarda la organización y el rol con motivo y cierra sesiones.', when: 'Para corregir una cuenta que no sea Owner, después de revisar el impacto.' },
    { icon: ShieldCheck, name: 'Cerrar todas las sesiones', does: 'Revoca las sesiones activas de otro usuario con un motivo.', when: 'Cuando necesitas finalizar su acceso actual; no aparece en tu propia cuenta ni sin sesiones activas.' },
    { icon: UserPlus, name: 'Otorgar permiso', does: 'Autoriza a un Owner elegible a administrar el paquete Premium.', when: 'Para delegar esa responsabilidad con un motivo registrado.' },
    { icon: ShieldCheck, name: 'Revocar', does: 'Retira el permiso Premium tras indicar un motivo y confirmar.', when: 'Si hay más de un titular y esa persona debe dejar de administrarlo.' },
    { icon: ChevronRight, name: 'Anterior / Siguiente', does: 'Recorre resultados en organizaciones, facturas, auditoría y seguridad.', when: 'Cuando hay más páginas disponibles para los filtros elegidos.' },
    { icon: ShieldQuestion, name: 'Actualizar (Reporte de integridad)', does: 'Vuelve a calcular los hallazgos de referencias huérfanas.', when: 'Después de corregir un dato para confirmar que el hallazgo desapareció.' },
    { icon: UserCheck, name: 'Agregar Owner', does: 'Promueve una cuenta aprobada o crea una invitación de 14 días para ese correo.', when: 'Cuando debes delegar acceso Owner sin compartir credenciales.' },
    { icon: Building2, name: 'Eliminar organización', does: 'Archiva una organización tras escribir su nombre exacto y un motivo.', when: 'Solo después de revisar el impacto y resolver cualquier Owner vinculado.' },
  ],
  examples: [
    {
      scenario: 'Salón Aurora informa una factura vencida y datos fiscales incompletos.',
      walkthrough: [
        'Busca Aurora en /owner/organizations, pulsa Enter y abre "Ver detalle" para comprobar identificación y campos pendientes.',
        'Usa "Editar información fiscal" para abrir la edición correspondiente.',
        'En /owner/billing/invoices, busca Aurora y filtra "Vencida". Comprueba el número, valor y vencimiento y descarga el PDF desde la tabla.',
        'Si debes gestionar el pago, ve a /owner/billing y localiza esa organización. La consulta global no registra pagos.',
      ],
    },
    {
      scenario: 'Una profesional de Aurora tiene sesiones abiertas en un equipo compartido.',
      walkthrough: [
        'En /owner/access, busca su correo y abre "Ver". Confirma que es la cuenta correcta y revisa sus sesiones activas.',
        'Escribe "Cierre solicitado por uso de equipo compartido" y pulsa "Cerrar todas las sesiones".',
        'Comprueba el aviso de éxito y el contador en cero. No uses "Eliminar usuario" para resolver un cierre de sesiones.',
      ],
    },
    {
      scenario: 'Vas a transferir la administración de Premium a otro Owner.',
      walkthrough: [
        'En /owner/capability-grants, selecciona al otro Owner aprobado, indica el motivo del relevo y pulsa "Otorgar permiso".',
        'Verifica que ambos estén en "Con permiso activo" antes de retirar el permiso anterior.',
        'Escribe el motivo de revocación del titular anterior y confirma "Revocar". Revisa el historial local.',
        'En /owner/audit-log, filtra "Permisos de plataforma" para revisar los eventos registrados, sus actores y motivos.',
      ],
    },
    {
      scenario: 'Necesitas revisar intentos de acceso entre organizaciones bloqueados.',
      walkthrough: [
        'En /owner/security-events, selecciona "Acceso entre organizaciones bloqueado".',
        'Revisa ocurrencias, última vez, ruta y código diagnóstico en la tabla y recorre las páginas disponibles.',
        'Comparte esos datos por el canal habitual de investigación. La huella de Origen no permite identificar directamente a una persona y esta vista no desbloquea accesos.',
      ],
    },
    {
      scenario: 'Una clase quedó sin instructor después de que alguien eliminó al profesional por error.',
      walkthrough: [
        'En /owner/integrity-report, filtra "Reservas y citas" y busca hallazgos de tipo "Clase sin profesional".',
        'Anota la organización y el ID de la clase (entidad) que muestra el detalle.',
        'Corrige el dato desde la administración de esa organización (reasignando o recreando al profesional), no desde este reporte.',
        'Vuelve al reporte y pulsa "Actualizar" para confirmar que el hallazgo ya no aparece.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Escribí una búsqueda y la lista no cambia.', fix: 'En organizaciones y facturas debes pulsar Enter para aplicar la búsqueda. En Control de accesos se filtra al escribir. Revisa también los filtros activos.' },
    { problem: 'El resumen no coincide con las filas visibles.', fix: 'En Matriz de terceros, los indicadores marcados como visibles cuentan la página actual. En facturas y seguridad, los resúmenes globales se cargan al entrar y no siguen los filtros de la lista.' },
    { problem: 'No encuentro Confirmar pago en Facturas globales.', fix: 'Esta vista consulta y descarga facturas. Gestiona pagos desde /owner/billing en la organización correspondiente.' },
    { problem: 'No aparece el control para cerrar sesiones.', fix: 'Está oculto para el Owner conectado y cuando el usuario seleccionado no tiene sesiones activas. Espera a que termine la carga; si falla, vuelve a abrir el detalle antes de interpretar el contador.' },
    { problem: 'Quiero eliminar una cuenta solo para cerrar su sesión.', fix: 'Usa "Cerrar todas las sesiones". "Eliminar usuario" abre una confirmación irreversible que cierra sesiones y elimina el acceso; no es un cierre temporal.' },
    { problem: 'No puedo cambiar la vinculación de una cuenta Owner.', fix: 'La operación de vinculación y rol solo está disponible para cuentas que no sean Owner. Para otras cuentas, selecciona organización y escribe un motivo de al menos 10 caracteres.' },
    { problem: 'No aparece Revocar o no hay Owners disponibles para otorgar permiso.', fix: 'Revocar se oculta si queda un solo titular. Otorga primero el permiso a otro Owner elegible. El selector solo ofrece Owners aprobados, activos, no eliminados y sin el permiso.' },
    { problem: 'Quiero corregir un dato desde auditoría o desbloquear un evento de seguridad.', fix: 'Ambos registros son estrictamente de solo lectura. Usa la administración correspondiente para cambios autorizados y conserva los datos del evento para la investigación.' },
    { problem: 'No veo eventos después de filtrar.', fix: 'Vuelve a todas las categorías, tipos o severidades y revisa la paginación. Una lista vacía para un filtro no demuestra que nunca haya habido actividad.' },
    { problem: 'La organización pregunta quién la revisó en modo visualización.', fix: 'La sesión queda solamente en la auditoría Owner; la organización no recibe aviso ni ve ese historial.' },
    { problem: 'Quiero corregir un hallazgo del reporte de integridad desde ahí mismo.', fix: 'El reporte es estrictamente de solo lectura, igual que auditoría y seguridad. Corrige el dato desde la página dueña de esa entidad (organizaciones, facturación o inventario) y vuelve a pulsar "Actualizar" para confirmar.' },
    { problem: 'Un hallazgo sigue apareciendo después de corregir el dato.', fix: 'Pulsa "Actualizar" para recalcular el reporte; no se actualiza solo. Si persiste, verifica que corregiste la organización correcta.' },
    { problem: 'No puedo eliminar una organización.', fix: 'La eliminación se bloquea mientras una cuenta Owner siga vinculada. Corrige la vinculación primero; después escribe el nombre exacto y un motivo.' },
    { problem: 'Soy el último Owner o administrador de una organización.', fix: 'No elimines esa organización para resolver un acceso. Agrega o promueve primero a la persona que mantendrá la administración y conserva el motivo auditado.' },
  ],
  checklist: [
    { id: 'oc1', label: 'Localicé una organización y revisé su detalle fiscal, personas y estados.' },
    { id: 'oc2', label: 'Sé buscar una factura global y dónde gestionar su pago por organización.' },
    { id: 'oc3', label: 'Revisé identidad, rol y organización antes de aprobar acceso.' },
    { id: 'oc4', label: 'Entendí el motivo y el impacto requerido para cambiar vinculación y rol.' },
    { id: 'oc5', label: 'Sé consultar sesiones y cuándo aparece el control para cerrarlas.' },
    { id: 'oc6', label: 'Sé delegar el permiso Premium conservando al menos un titular.' },
    { id: 'oc7', label: 'Sé filtrar auditoría y consultar actores, motivos y entidades en la tabla.' },
    { id: 'oc8', label: 'Distingo eventos de seguridad, ocurrencias y huellas anonimizadas; el registro es de solo lectura.' },
    { id: 'oc9', label: 'Sé leer el reporte de integridad por dominio y sé que la corrección se hace en la página dueña del dato.' },
    { id: 'oc10', label: 'Sé abrir una vista de organización solo lectura y salir al terminar.' },
    { id: 'oc11', label: 'Sé agregar un Owner existente o enviar una invitación de 14 días por correo.' },
    { id: 'oc12', label: 'Sé cuándo una organización puede archivarse y cómo confirmar su nombre y motivo.' },
  ],
};

const ownerConsole = { id: 'owner-console', perRole: { owner } };

export default ownerConsole;
