// frontend/src/guide/guideContent/agenda.jsx
import {
  Filter,
  CreditCard,
  XCircle,
  CheckCircle,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Phone,
  Mail,
  Link2,
  QrCode,
  Clock,
  Eye,
  Building2,
} from 'lucide-react';

const manager = {
  summary: {
    what: 'La Agenda es el historial y el centro de control de las citas del negocio: puedes filtrarlas, cancelarlas y registrar el cobro cuando se atienden.',
    forWhat: 'Sirve para llevar el control diario: ver qué está confirmado, cerrar las citas atendidas con su cobro y cancelar las que no se realizarán.',
    whoUses: 'El Manager (y el Owner) durante toda la jornada, sobre todo al cerrar cada cita.',
  },
  screens: [
    {
      title: 'Historial de Citas',
      screenshot: {
        src: null,
        alt: 'Pantalla "Historial de Citas": barra superior con "Volver" y el contador de citas; bloque "Filtros" con un selector de Estado, campos Desde y Hasta y un enlace "Limpiar filtros"; tabla con columnas Fecha y Hora, Cliente, Concepto, Profesional, Valor, Estado y Acciones; en cada cita confirmada, botones para "Completar y cobrar" y "Cancelar cita"; abajo, paginación.',
      },
      zones: [
        { n: 1, label: 'Filtros', desc: 'Estado, Desde y Hasta acotan la lista', xPct: 30, yPct: 22 },
        { n: 2, label: 'Limpiar filtros', desc: 'quita todos los filtros aplicados', xPct: 15, yPct: 34 },
        { n: 3, label: 'Columna Estado', desc: 'Confirmada, Completada o Cancelada', xPct: 70, yPct: 50 },
        { n: 4, label: 'Acciones de la fila', desc: '"Completar y cobrar" y "Cancelar cita" en las citas confirmadas', xPct: 90, yPct: 50 },
        { n: 5, label: 'Paginación', desc: 'avanza o retrocede entre páginas de 10 citas', xPct: 80, yPct: 90 },
      ],
    },
    {
      title: 'Ventana "Completar y cobrar"',
      screenshot: {
        src: null,
        alt: 'Ventana modal "Completar y cobrar": resumen con precio original, descuento, valor neto, propina y total recibido; campos para Descuento y Propina; selector de Medio de pago (Efectivo, Tarjeta, Transferencia, Nequi, Daviplata, Otro); campo de Observaciones; botones "Cancelar" y "Confirmar cobro".',
      },
      zones: [
        { n: 1, label: 'Resumen del cobro', desc: 'calcula valor neto y total recibido en vivo', xPct: 50, yPct: 25 },
        { n: 2, label: 'Descuento y Propina', desc: 'montos en pesos; no pueden ser negativos', xPct: 50, yPct: 48 },
        { n: 3, label: 'Medio de pago', desc: 'cómo pagó el cliente', xPct: 50, yPct: 63 },
        { n: 4, label: 'Confirmar cobro', desc: 'cierra la cita como completada y registra el ingreso', xPct: 75, yPct: 90 },
      ],
    },
  ],
  steps: [
    {
      id: 'a1',
      title: 'Filtrar la agenda',
      substeps: [
        'Abre "Agenda" desde la barra lateral o desde "Nueva cita" en el panel.',
        'En "Filtros", elige un "Estado" (Todas, Confirmadas, Completadas o Canceladas).',
        'Usa "Desde" y "Hasta" para acotar por fechas.',
        'Para ver todo de nuevo, pulsa "Limpiar filtros".',
      ],
      expected: 'La tabla muestra solo las citas que cumplen los filtros y el contador de arriba se ajusta.',
    },
    {
      id: 'a2',
      title: 'Marcar una cita como realizada y registrar el cobro',
      substeps: [
        'Ubica la cita confirmada en la tabla.',
        'Pulsa "Completar y cobrar" (ícono de tarjeta).',
        'Escribe el "Descuento" y la "Propina" si aplican.',
        'Elige el "Medio de pago" y añade "Observaciones" si lo necesitas.',
        'Revisa el "Total recibido" y pulsa "Confirmar cobro".',
      ],
      expected: 'La cita pasa a "Completada", el ingreso queda registrado y, si el servicio consume insumos, se descuentan del inventario.',
    },
    {
      id: 'a3',
      title: 'Cancelar una cita',
      substeps: [
        'Ubica la cita confirmada.',
        'Pulsa "Cancelar cita" (ícono de círculo con equis).',
        'La cita queda como "Cancelada" y su valor deja de contar.',
      ],
      expected: 'La cita aparece tachada y con estado "Cancelada"; el horario del profesional vuelve a quedar libre.',
    },
    {
      id: 'a4',
      title: 'Revisar la semana en el calendario',
      substeps: [
        'El "Calendario Semanal" vive en el módulo "Inicio", no en la Agenda.',
        'Ábrelo desde "Inicio" para ver la ocupación por día y hora (ver la guía de "Inicio" para el detalle de sus controles).',
      ],
      expected: 'Ves qué horas están ocupadas o bloqueadas antes de acordar una nueva cita con un cliente.',
    },
    {
      id: 'a5',
      title: 'Reagendar una cita',
      substeps: [
        'La reprogramación la hace el cliente desde su portal o desde el enlace de gestión que recibe por correo.',
        'Desde la Agenda, si necesitas moverla tú, cancela la cita actual.',
        'Comparte el "Link de Reservas" o el "Portal del Cliente" (en "Herramientas para Clientes" del panel) para que se registre en la nueva hora.',
      ],
      expected: 'La cita vieja queda cancelada y la nueva reserva aparece confirmada en la agenda.',
    },
  ],
  buttons: [
    { icon: ArrowLeft, name: 'Volver', does: 'Regresa al panel "Inicio".', when: 'Cuando terminas de trabajar la agenda.' },
    { icon: Filter, name: 'Selector "Estado"', does: 'Filtra la tabla por Todas, Confirmadas, Completadas o Canceladas.', when: 'Cuando quieres concentrarte en un tipo de cita, por ejemplo solo las confirmadas del día.' },
    { icon: Calendar, name: 'Campo "Desde"', does: 'Fija la fecha inicial del rango de la búsqueda.', when: 'Para revisar un periodo concreto.' },
    { icon: Calendar, name: 'Campo "Hasta"', does: 'Fija la fecha final del rango de la búsqueda.', when: 'Para cerrar el periodo que quieres ver.' },
    { icon: RefreshCw, name: 'Limpiar filtros', does: 'Quita el estado y las fechas y vuelve a mostrar todas las citas.', when: 'Cuando terminaste de revisar un filtro y quieres la vista completa.' },
    { icon: CreditCard, name: 'Completar y cobrar', does: 'Abre la ventana de cobro para cerrar una cita confirmada como completada.', when: 'Justo después de atender al cliente.' },
    { icon: XCircle, name: 'Cancelar cita', does: 'Marca una cita confirmada como cancelada y libera el horario.', when: 'Cuando el cliente avisa que no vendrá o la cita no se realizará.' },
    { icon: CreditCard, name: 'Campo "Descuento" (ventana de cobro)', does: 'Resta un monto en pesos del precio del servicio; no puede superar el precio.', when: 'Cuando aplicas una promoción o un acuerdo con el cliente.' },
    { icon: CreditCard, name: 'Campo "Propina" (ventana de cobro)', does: 'Suma un monto en pesos como propina para el profesional.', when: 'Cuando el cliente deja propina.' },
    { icon: CreditCard, name: 'Selector "Medio de pago" (ventana de cobro)', does: 'Registra cómo pagó: Efectivo, Tarjeta, Transferencia, Nequi, Daviplata u Otro.', when: 'En cada cobro, antes de confirmar.' },
    { icon: CreditCard, name: 'Campo "Observaciones" (ventana de cobro)', does: 'Guarda una nota libre sobre el cobro (hasta 500 caracteres).', when: 'Cuando hay algo que aclarar sobre ese pago.' },
    { icon: CheckCircle, name: 'Confirmar cobro', does: 'Cierra la cita como completada, registra el ingreso y descuenta insumos si corresponde.', when: 'Cuando el resumen "Total recibido" es correcto.' },
    { icon: XCircle, name: 'Cancelar (ventana de cobro)', does: 'Cierra la ventana sin registrar el cobro.', when: 'Si abriste la ventana por error o el cliente aún no ha pagado.' },
    { icon: ChevronLeft, name: 'Página anterior', does: 'Muestra la página anterior de la tabla (10 citas por página).', when: 'Para volver a citas ya revisadas.' },
    { icon: ChevronRight, name: 'Página siguiente', does: 'Muestra la página siguiente de la tabla.', when: 'Para seguir revisando citas más antiguas.' },
    { icon: CalendarDays, name: 'Calendario Semanal (en "Inicio")', does: 'Muestra la ocupación de la semana por día y hora. Sus controles (semanas, "Hoy", filtro de profesional) se explican en la guía de "Inicio".', when: 'Para revisar disponibilidad antes de acordar una nueva cita.' },
    { icon: Link2, name: 'Link de Reservas / Portal del Cliente', does: 'Copia el enlace público para que el cliente reserve o gestione su cita.', when: 'Cuando necesitas que el cliente agende o reprograme por su cuenta.' },
    { icon: QrCode, name: 'QR Reservas / QR Portal Cliente', does: 'Genera un código QR imprimible de esos enlaces.', when: 'Para dejarlo visible en el local.' },
  ],
  examples: [
    {
      scenario: 'Un cliente llama para mover su cita del martes 3:00 p. m. al jueves.',
      walkthrough: [
        'Abre "Agenda" y filtra por "Confirmadas" y por la fecha del martes para ubicar la cita.',
        'Pulsa "Cancelar cita" en esa fila.',
        'En el panel "Inicio", copia el "Link de Reservas" (o el "Portal del Cliente" si ya está registrado).',
        'Envíaselo al cliente para que elija el jueves y la nueva hora; la reserva nueva llega confirmada.',
      ],
    },
    {
      scenario: 'Acabas de atender a un cliente que pagó $30.000 en efectivo y dejó $5.000 de propina.',
      walkthrough: [
        'En "Agenda", ubica su cita confirmada y pulsa "Completar y cobrar".',
        'Deja "Descuento" en 0 y escribe 5000 en "Propina".',
        'Elige "Efectivo" como medio de pago.',
        'Verifica que "Total recibido" muestre $35.000 y pulsa "Confirmar cobro".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'No encuentro un botón para reagendar la cita desde la Agenda.', fix: 'La Agenda no reprograma citas. La reprogramación la hace el cliente desde su portal o desde el enlace de gestión que recibe. Si debes moverla tú, cancélala y comparte el enlace de reservas.' },
    { problem: 'Los "Ingresos de hoy" no suben aunque ya atendimos.', fix: 'El ingreso se registra solo al pulsar "Confirmar cobro" en "Completar y cobrar". Si la cita sigue "Confirmada", todavía no cuenta.' },
    { problem: 'Cancelé una cita por error.', fix: 'La cancelación no se deshace desde la Agenda. Comparte el enlace de reservas para volver a agendar al cliente en el mismo horario si sigue libre.' },
    { problem: 'El botón "Confirmar cobro" no me deja continuar.', fix: 'Revisa que el descuento no sea mayor que el precio del servicio y que ni el descuento ni la propina sean negativos.' },
  ],
  checklist: [
    { id: 'a1', label: 'Filtré la agenda por estado y por rango de fechas, y luego usé "Limpiar filtros".' },
    { id: 'a2', label: 'Cerré una cita de prueba con "Completar y cobrar" eligiendo el medio de pago.' },
    { id: 'a3', label: 'Entendí que cancelar una cita libera el horario y no cuenta su valor.' },
    { id: 'a4', label: 'Revisé la semana en el "Calendario Semanal" y filtré por un profesional.' },
    { id: 'a5', label: 'Sé cómo se reagenda una cita (el cliente, desde su enlace).' },
  ],
};

const owner = {
  summary: {
    what: 'Todo lo que ve el Manager en la Agenda aplica para ti; además, como Owner la agenda que ves depende de la organización seleccionada.',
    forWhat: 'Sirve para revisar y cerrar citas de cualquiera de tus sedes desde la misma pantalla. Para el detalle completo de cada botón y paso de este módulo, abre la vista "Guía del Manager" con el selector de arriba.',
    whoUses: 'El Owner, cuando supervisa la operación de una o varias sedes.',
  },
  screens: [
    {
      title: 'La agenda es por organización',
      screenshot: {
        src: null,
        alt: 'Historial de Citas del Owner: idéntico al del Manager, pero las citas mostradas corresponden a la organización activa; al cambiar de sede en "Inicio", la agenda se recarga con las citas de esa sede.',
      },
      zones: [
        { n: 1, label: 'Organización activa', desc: 'define qué citas se listan; se elige en "Inicio"', xPct: 25, yPct: 12 },
        { n: 2, label: 'Tabla de citas', desc: 'solo las citas de la sede seleccionada', xPct: 55, yPct: 55 },
      ],
    },
  ],
  steps: [
    {
      id: 'a6',
      title: 'Revisar la agenda de otra sede',
      substeps: [
        'Abre "Inicio" y cambia de organización en la tarjeta "Organización".',
        'Entra a "Agenda" desde la barra lateral.',
        'La tabla muestra únicamente las citas de esa sede.',
      ],
      expected: 'Trabajas la agenda de la sede seleccionada sin mezclar citas de otras.',
    },
  ],
  buttons: [
    { icon: Building2, name: 'Selector de organización (en "Inicio")', does: 'Define de qué sede se muestran las citas en la Agenda.', when: 'Antes de entrar a la Agenda cuando administras varias sedes.' },
  ],
  examples: [
    {
      scenario: 'Quieres cerrar los cobros pendientes de tu segunda sede al final del día.',
      walkthrough: [
        'En "Inicio", selecciona la segunda sede.',
        'Abre "Agenda" y filtra por "Confirmadas".',
        'Cierra cada cita atendida con "Completar y cobrar".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Veo citas que no son de la sede que quería revisar.', fix: 'Vuelve a "Inicio", selecciona la sede correcta y entra a "Agenda" desde ahí. La sede activa viaja en el enlace.' },
  ],
  checklist: [
    { id: 'a6', label: 'Cambié de organización y confirmé que la Agenda mostró solo las citas de esa sede.' },
    { id: 'a7', label: 'Cerré al menos un cobro pendiente en una sede.' },
    { id: 'a8', label: 'Entendí que los filtros y acciones son los mismos que ve el Manager.' },
  ],
};

const staff = {
  summary: {
    what: '"Mis citas" es tu agenda personal: solo muestra las reservas asignadas a tu perfil, organizadas en Hoy, Próximas e Historial.',
    forWhat: 'Sirve para saber a quién atiendes hoy, prepararte para las próximas citas y contactar al cliente si hace falta.',
    whoUses: 'Cada profesional sobre sus propias citas. No agendas ni cobras: eso lo hace la administración.',
  },
  screens: [
    {
      title: 'Mis citas',
      screenshot: {
        src: null,
        alt: 'Pantalla "Mis citas": cuatro tarjetas (Total, Confirmadas, Completadas, Canceladas); un control con "Hoy", "Próximas" e "Historial" y un selector de estado; una lista de citas con fecha, hora, servicio, cliente y estado, y un enlace "Ver detalle" en cada una que abre un panel lateral con los datos y los botones "Llamar" y "Correo".',
      },
      zones: [
        { n: 1, label: 'Tarjetas de resumen', desc: 'Total, Confirmadas, Completadas y Canceladas del periodo', xPct: 45, yPct: 22 },
        { n: 2, label: 'Hoy / Próximas / Historial', desc: 'cambia el periodo de la lista', xPct: 25, yPct: 40 },
        { n: 3, label: 'Selector de estado', desc: 'filtra por Confirmadas, Completadas o Canceladas', xPct: 65, yPct: 40 },
        { n: 4, label: 'Ver detalle', desc: 'abre el panel lateral con los datos de la cita', xPct: 88, yPct: 60 },
        { n: 5, label: 'Llamar / Correo', desc: 'contacta al cliente desde el panel de detalle', xPct: 70, yPct: 80 },
      ],
    },
  ],
  steps: [
    {
      id: 'a9',
      title: 'Ver tus citas de hoy',
      substeps: [
        'Abre "Mis citas" (desde tu perfil o la barra inferior).',
        'En el control de periodos, elige "Hoy".',
        'Revisa la lista: cada fila muestra la hora, el servicio y el cliente.',
      ],
      expected: 'Ves solo las citas asignadas a tu perfil para el día de hoy.',
    },
    {
      id: 'a10',
      title: 'Consultar próximas citas y el historial',
      substeps: [
        'Pulsa "Próximas" para ver las citas de los siguientes días.',
        'Pulsa "Historial" para ver citas pasadas.',
        'Si quieres, usa el selector de estado para ver solo "Confirmadas", "Completadas" o "Canceladas".',
      ],
      expected: 'Encuentras rápido la cita que buscas según su fecha y estado.',
    },
    {
      id: 'a11',
      title: 'Abrir el detalle de una cita y contactar al cliente',
      substeps: [
        'En la cita que te interese, pulsa "Ver detalle".',
        'En el panel lateral revisa estado, fecha, hora, duración, cliente y si el cobro está registrado o pendiente.',
        'Pulsa "Llamar" o "Correo" para contactar al cliente (aparecen si la cita tiene ese dato).',
      ],
      expected: 'Tienes el contexto de la cita y puedes comunicarte con el cliente sin salir de la app.',
    },
  ],
  buttons: [
    { icon: CalendarDays, name: 'Hoy', does: 'Muestra solo las citas de hoy.', when: 'Al empezar tu jornada.' },
    { icon: CalendarDays, name: 'Próximas', does: 'Muestra las citas de los próximos días.', when: 'Para planear los días siguientes.' },
    { icon: Clock, name: 'Historial', does: 'Muestra las citas pasadas.', when: 'Para consultar una cita ya atendida.' },
    { icon: Filter, name: 'Selector de estado', does: 'Filtra la lista por Confirmadas, Completadas o Canceladas.', when: 'Cuando buscas un tipo concreto de cita.' },
    { icon: Eye, name: 'Ver detalle', does: 'Abre el panel lateral con todos los datos de la cita.', when: 'Cuando necesitas más información que la de la lista.' },
    { icon: Phone, name: 'Llamar', does: 'Abre el marcador del teléfono con el número del cliente.', when: 'Para confirmar o avisar algo de la cita.' },
    { icon: Mail, name: 'Correo', does: 'Abre tu app de correo con la dirección del cliente.', when: 'Cuando prefieres escribirle en lugar de llamar.' },
    { icon: RefreshCw, name: 'Reintentar', does: 'Vuelve a cargar el resumen y la lista de citas.', when: 'Si aparece un aviso de que algún dato no se pudo cargar.' },
  ],
  examples: [
    {
      scenario: 'Vas llegando al local y quieres saber tu primera cita y si el cliente ya tiene todo listo.',
      walkthrough: [
        'Abre "Mis citas" y elige "Hoy".',
        'Pulsa "Ver detalle" en la primera cita.',
        'Revisa la hora, el servicio y si el "Cobro" está "Pendiente".',
        'Si necesitas confirmar algo, pulsa "Llamar".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'No puedo crear ni mover una cita desde "Mis citas".', fix: 'Es correcto: agendar, reprogramar y cobrar lo hace la administración. Tú consultas tus citas y contactas al cliente.' },
    { problem: 'Una cita que atendí sigue apareciendo como "Confirmada".', fix: 'La cita cambia a "Completada" cuando la administración registra el cobro. Si lleva rato sin cambiar, avisa a la administración.' },
    { problem: 'No veo los botones "Llamar" o "Correo".', fix: 'Solo aparecen si la cita tiene registrado el teléfono o el correo del cliente. Si faltan, pídele el dato a la administración.' },
  ],
  checklist: [
    { id: 'a9', label: 'Revisé mis citas de "Hoy".' },
    { id: 'a10', label: 'Consulté "Próximas" e "Historial" y probé el filtro de estado.' },
    { id: 'a11', label: 'Abrí "Ver detalle" de una cita y ubiqué el estado del cobro.' },
  ],
};

const agenda = {
  id: 'agenda',
  perRole: {
    owner,
    manager,
    staff,
  },
};

export default agenda;
