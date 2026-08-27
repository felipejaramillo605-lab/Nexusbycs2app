// frontend/src/guide/guideContent/dashboard.jsx
import {
  Plus,
  CalendarDays,
  Users,
  WalletCards,
  Scissors,
  DollarSign,
  LogOut,
  Clock3,
  Bell,
  CheckCircle,
  Volume2,
  Menu,
  BookOpen,
  Link2,
  QrCode,
  ChevronLeft,
  ChevronRight,
  Sun,
  Save,
  Clock,
  UserRound,
  Star,
  ShieldCheck,
  Building2,
  Megaphone,
  CreditCard,
  ContactRound,
  RefreshCw,
} from 'lucide-react';

const manager = {
  summary: {
    what: 'El Inicio es el panel principal del negocio. Reúne en una sola pantalla la agenda del día, los ingresos de hoy, atajos a los módulos y las estadísticas del periodo.',
    forWhat: 'Sirve para abrir el día con una foto clara: cuántas citas hay, cuánto se ha cobrado, qué profesionales están activos y qué falta por atender.',
    whoUses: 'Lo usa el Manager (y el Owner) cada mañana y varias veces al día para hacer seguimiento a la operación.',
  },
  screens: [
    {
      title: 'Panel del Manager de un vistazo',
      screenshot: {
        src: null,
        alt: 'Panel del Manager: barra lateral con los módulos a la izquierda, barra superior con "Todos los módulos", campana de notificaciones y apariencia; encabezado con el botón "Nueva cita"; cuatro tarjetas de métricas (Citas de hoy, Ingresos de hoy, Profesionales activos, Servicios disponibles); a la izquierda la lista "Agenda de hoy" con un filtro por profesional y a la derecha "Acciones rápidas".',
      },
      zones: [
        { n: 1, label: 'Barra lateral', desc: 'navegación entre todos los módulos, agrupados por área', xPct: 8, yPct: 45 },
        { n: 2, label: 'Barra superior', desc: '"Todos los módulos", campana de notificaciones, apariencia y "Salir"', xPct: 75, yPct: 7 },
        { n: 3, label: 'Botón "Nueva cita"', desc: 'abre la agenda para registrar una cita', xPct: 90, yPct: 20 },
        { n: 4, label: 'Tarjetas de métricas', desc: 'citas de hoy, ingresos de hoy, profesionales activos y servicios disponibles', xPct: 45, yPct: 33 },
        { n: 5, label: 'Agenda de hoy', desc: 'lista de las próximas citas con filtro por profesional', xPct: 30, yPct: 62 },
        { n: 6, label: 'Acciones rápidas', desc: 'atajos a Agenda, Clientes, Ingresos y Servicios', xPct: 80, yPct: 62 },
      ],
    },
  ],
  steps: [
    {
      id: 'd1',
      title: 'Leer tu día de un vistazo',
      substeps: [
        'Entra a "Inicio" desde la barra lateral.',
        'Mira las cuatro tarjetas de arriba: citas de hoy, ingresos de hoy, profesionales activos y servicios disponibles.',
        'Revisa la lista "Agenda de hoy" para ver las próximas citas con su hora, cliente, servicio y profesional.',
        'Usa el filtro de la esquina de "Agenda de hoy" para ver solo las citas de un profesional.',
      ],
      expected: 'Sabes cuántas citas tienes, cuánto se ha cobrado hoy y quién atiende cada cita.',
    },
    {
      id: 'd2',
      title: 'Abrir la agenda desde el panel',
      substeps: [
        'Pulsa "Nueva cita" en la esquina superior derecha del encabezado.',
        'Se abre el módulo "Agenda y citas", donde ves y gestionas todas las citas.',
        'Para registrar una cita nueva, comparte el "Link de Reservas" (en "Herramientas para Clientes", más abajo en el panel) con el cliente, o pídele que use el "Portal del Cliente" si ya está registrado.',
      ],
      expected: 'Llegas a la Agenda; la cita nueva aparece confirmada cuando el cliente completa la reserva por el enlace.',
    },
    {
      id: 'd3',
      title: 'Moverte entre módulos',
      substeps: [
        'Usa la barra lateral para ir a un módulo (Agenda, Clientes, Servicios, Equipo, Ingresos y más).',
        'En pantalla pequeña, pulsa "Todos los módulos" (o "Más") en la barra para abrir el listado completo.',
        'También puedes usar los botones de "Acciones rápidas" para saltar a Agenda, Clientes, Ingresos o Servicios.',
      ],
      expected: 'Llegas al módulo que necesitas sin perder la organización seleccionada.',
    },
    {
      id: 'd4',
      title: 'Configurar el sonido de las notificaciones',
      substeps: [
        'Pulsa la campana en la barra superior.',
        'Dentro del panel de notificaciones, pulsa el ícono de volumen (arriba a la derecha).',
        'Elige un sonido: "Clásico", "Suave" o "Alerta"; se reproduce una muestra al seleccionarlo.',
        'Si prefieres no escuchar avisos, pulsa "Silenciar".',
      ],
      expected: 'Las nuevas notificaciones suenan con el tono elegido, o quedan en silencio si lo silenciaste.',
    },
    {
      id: 'd5',
      title: 'Cambiar entre tema claro y oscuro',
      substeps: [
        'Pulsa "Apariencia" en la barra superior.',
        'Elige "Claro", "Oscuro" o "Sistema" (sigue la configuración del dispositivo).',
      ],
      expected: 'La aplicación cambia de tema al instante y recuerda tu elección.',
    },
  ],
  buttons: [
    { icon: Menu, name: 'Barra lateral / "Todos los módulos"', does: 'Muestra la navegación completa entre módulos, agrupada por área.', when: 'Cuando necesitas ir a un módulo que no está en los atajos, sobre todo en el celular.' },
    { icon: Plus, name: 'Nueva cita', does: 'Abre el módulo "Agenda y citas". No es un formulario de creación: las citas se agendan compartiendo el enlace de reservas con el cliente.', when: 'Cuando quieres ir a la agenda para revisar, cobrar o cancelar citas.' },
    { icon: Building2, name: 'Selector de organización', does: 'Cambia la sede o negocio que estás viendo (solo aparece si tienes más de una y eres Owner).', when: 'Cuando administras varias sedes y quieres revisar otra.' },
    { icon: CalendarDays, name: 'Métrica "Citas de hoy"', does: 'Muestra el número de citas del día. Es informativa.', when: 'Para dimensionar la carga del día.' },
    { icon: DollarSign, name: 'Métrica "Ingresos de hoy"', does: 'Muestra el total cobrado hoy (cobros confirmados). Es informativa.', when: 'Para saber cuánto ha entrado en caja hasta el momento.' },
    { icon: Users, name: 'Métrica "Profesionales activos"', does: 'Cuenta los profesionales con cita hoy. Es informativa.', when: 'Para ver quién está trabajando en el día.' },
    { icon: Scissors, name: 'Métrica "Servicios disponibles"', does: 'Cuenta los servicios activos del catálogo. Es informativa.', when: 'Para verificar de un vistazo el tamaño del menú de servicios.' },
    { icon: Clock3, name: 'Filtro de "Agenda de hoy"', does: 'Filtra la lista de citas del día por "Todas" o por un profesional.', when: 'Cuando quieres revisar solo la agenda de un barbero o estilista.' },
    { icon: CalendarDays, name: 'Abrir agenda', does: 'Va al módulo de Agenda y citas.', when: 'Para gestionar citas, filtrarlas o cobrarlas.' },
    { icon: Users, name: 'Clientes', does: 'Va al módulo de Clientes.', when: 'Para buscar un cliente o revisar su historial.' },
    { icon: WalletCards, name: 'Ingresos', does: 'Va al módulo de Ingresos.', when: 'Para revisar el detalle financiero de un periodo.' },
    { icon: Scissors, name: 'Servicios', does: 'Va al módulo de Servicios.', when: 'Para crear o ajustar servicios, precios y duraciones.' },
    { icon: Link2, name: 'Link de Reservas', does: 'Copia el enlace público para que un cliente nuevo reserve su primera cita.', when: 'Cuando quieres compartir el enlace por WhatsApp o redes.' },
    { icon: UserRound, name: 'Link Portal del Cliente', does: 'Copia el enlace del portal donde los clientes registrados ven su historial y reservan.', when: 'Cuando el cliente ya existe y quieres que gestione sus propias citas.' },
    { icon: QrCode, name: 'QR Reservas', does: 'Genera un código QR del enlace de reservas para imprimir; se puede descargar.', when: 'Para poner un QR en la recepción o en la vitrina.' },
    { icon: QrCode, name: 'QR Portal Cliente', does: 'Genera un código QR del portal del cliente para imprimir; se puede descargar.', when: 'Para clientes frecuentes que quieren acceder rápido a su portal.' },
    { icon: CalendarDays, name: 'Rango de fechas de "Ingresos y operación"', does: 'Define el periodo (Desde / Hasta) de las estadísticas y gráficas financieras del panel.', when: 'Cuando quieres ver la semana, la quincena o el mes.' },
    { icon: ChevronLeft, name: 'Semana anterior / siguiente (calendario semanal)', does: 'Mueve el calendario semanal una semana hacia atrás o hacia adelante.', when: 'Para revisar la ocupación de otra semana.' },
    { icon: ChevronRight, name: 'Botón "Hoy" (calendario semanal)', does: 'Regresa el calendario semanal a la semana actual.', when: 'Cuando te alejaste navegando entre semanas.' },
    { icon: Users, name: 'Filtro de profesional (calendario semanal)', does: 'Muestra el calendario de "Todos los profesionales" o de uno solo.', when: 'Para revisar la disponibilidad de un profesional específico.' },
    { icon: Bell, name: 'Campana de notificaciones', does: 'Abre el listado de notificaciones (avisos, alertas y comunicados).', when: 'Cuando el contador de la campana muestra avisos sin leer.' },
    { icon: CheckCircle, name: 'Marcar todas como leídas (dentro de la campana)', does: 'Marca como leídas todas las notificaciones pendientes de una vez.', when: 'Cuando ya revisaste los avisos y quieres limpiar el contador.' },
    { icon: Volume2, name: 'Configurar sonido (dentro de la campana)', does: 'Cambia el tono del aviso ("Clásico", "Suave", "Alerta") o silencia las notificaciones.', when: 'Cuando el sonido te molesta o no lo escuchas.' },
    { icon: QrCode, name: 'Descargar QR (dentro de la ventana del QR)', does: 'Guarda el código QR como imagen para imprimirlo.', when: 'Después de generar el QR de reservas o del portal.' },
    { icon: Sun, name: 'Apariencia', does: 'Cambia el tema entre "Claro", "Oscuro" y "Sistema".', when: 'Según la luz del local o tu preferencia.' },
    { icon: LogOut, name: 'Salir', does: 'Cierra tu sesión y vuelve a la pantalla de inicio de sesión.', when: 'Al terminar tu turno o si usas un equipo compartido.' },
  ],
  examples: [
    {
      scenario: 'Llegas en la mañana y quieres saber cuánto se espera que entre hoy y qué citas faltan por atender.',
      walkthrough: [
        'Abre "Inicio".',
        'Lee la tarjeta "Citas de hoy" y la tarjeta "Ingresos de hoy".',
        'Revisa "Agenda de hoy" de arriba a abajo para ver las próximas citas.',
        'Si quieres el detalle de un solo profesional, usa el filtro de esa sección.',
      ],
    },
    {
      scenario: 'Vas a pegar un código QR en la recepción para que los clientes nuevos reserven solos.',
      walkthrough: [
        'En "Inicio", baja hasta "Herramientas para Clientes".',
        'Pulsa "QR Reservas".',
        'Pulsa "Descargar QR" e imprime la imagen.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Los "Ingresos de hoy" están en cero aunque ya atendimos clientes.', fix: 'Los ingresos solo cuentan los cobros confirmados. Si la cita se atendió pero no se registró el cobro desde "Completar y cobrar" en la Agenda, todavía no suma.' },
    { problem: 'No veo el selector para cambiar de sede.', fix: 'Ese selector solo aparece para el Owner y solo cuando hay más de una organización. Si eres Manager, siempre ves la sede a la que perteneces.' },
    { problem: 'La agenda del día se ve vacía.', fix: 'Revisa el filtro de "Agenda de hoy": puede estar mostrando solo un profesional. Cámbialo a "Todas".' },
    { problem: 'Pulsé "Nueva cita" y esperaba un formulario para agendar.', fix: '"Nueva cita" solo abre el módulo de Agenda. Para crear una cita, comparte el "Link de Reservas" o el "Portal del Cliente" (en "Herramientas para Clientes") y el cliente elige fecha y hora.' },
  ],
  checklist: [
    { id: 'd1', label: 'Revisé las cuatro tarjetas de métricas y entiendo qué mide cada una.' },
    { id: 'd2', label: 'Filtré "Agenda de hoy" por un profesional y volví a "Todas".' },
    { id: 'd3', label: 'Copié el "Link de Reservas" desde "Herramientas para Clientes".' },
    { id: 'd4', label: 'Elegí un sonido de notificación en el menú de la campana.' },
    { id: 'd5', label: 'Cambié el tema con "Apariencia" y lo dejé como lo prefiero.' },
  ],
};

const owner = {
  summary: {
    what: 'Todo lo que ve el Manager en este módulo aplica para ti; además, como Owner ves el selector de organización y el grupo "Administración" en la barra lateral.',
    forWhat: 'Sirve para supervisar cada sede desde el mismo panel y entrar a las herramientas de administración del negocio. Para el detalle completo de cada botón y paso de este módulo, abre la vista "Guía del Manager" con el selector de arriba.',
    whoUses: 'El Owner, cuando revisa la operación de una o varias sedes y gestiona accesos, suscripciones o comunicados.',
  },
  screens: [
    {
      title: 'Diferencias del panel para el Owner',
      screenshot: {
        src: null,
        alt: 'Panel del Owner: igual al del Manager, pero con una tarjeta "Organización" que despliega la lista de sedes y, en la barra lateral, un grupo "Administración" con Control de accesos, Suscripciones, Matriz de terceros y Comunicados.',
      },
      zones: [
        { n: 1, label: 'Selector de organización', desc: 'lista desplegable para cambiar de sede; también se refleja en la URL', xPct: 20, yPct: 22 },
        { n: 2, label: 'Grupo "Administración"', desc: 'Control de accesos, Suscripciones, Matriz de terceros y Comunicados', xPct: 8, yPct: 78 },
        { n: 3, label: 'Resto del panel', desc: 'métricas, "Agenda de hoy" y estadísticas: idénticas a la vista del Manager', xPct: 55, yPct: 45 },
      ],
    },
  ],
  steps: [
    {
      id: 'd6',
      title: 'Cambiar de organización',
      substeps: [
        'En "Inicio", abre la tarjeta "Organización" (arriba, debajo del encabezado).',
        'Elige la sede que quieres revisar.',
        'El panel recarga las métricas, la agenda y las estadísticas de esa sede.',
      ],
      expected: 'Todo el panel (y los módulos a los que entres después) queda apuntando a la sede seleccionada.',
    },
    {
      id: 'd7',
      title: 'Entrar a las herramientas de administración',
      substeps: [
        'En la barra lateral, busca el grupo "Administración".',
        'Abre "Control de accesos" para aprobar o revocar el ingreso de personas a la cuenta.',
        'Abre "Suscripciones" para revisar el plan y el estado de pago.',
        'Abre "Matriz de terceros" para ver los encargados del tratamiento de datos, y "Comunicados" para enviar avisos internos.',
      ],
      expected: 'Llegas a la herramienta de administración que necesitas sin salir del panel.',
    },
  ],
  buttons: [
    { icon: Building2, name: 'Selector de organización', does: 'Cambia la sede activa en todo el panel y la conserva al navegar a otros módulos.', when: 'Cuando administras varias sedes y quieres revisar otra.' },
    { icon: ShieldCheck, name: 'Control de accesos', does: 'Abre la administración de accesos: aprobar, rechazar o revocar el ingreso de usuarios.', when: 'Cuando entra o sale alguien del equipo administrativo.' },
    { icon: CreditCard, name: 'Suscripciones', does: 'Muestra el plan contratado, su estado y la información de facturación.', when: 'Para revisar el estado del pago o cambiar de plan.' },
    { icon: ContactRound, name: 'Matriz de terceros', does: 'Lista los terceros que tratan datos personales por cuenta del negocio.', when: 'Cuando actualizas proveedores o revisas cumplimiento de datos.' },
    { icon: Megaphone, name: 'Comunicados', does: 'Permite publicar avisos internos que el equipo ve en su campana de notificaciones.', when: 'Cuando necesitas informar algo a todo el equipo.' },
  ],
  examples: [
    {
      scenario: 'Tienes dos sedes y quieres comparar cómo va el día en cada una.',
      walkthrough: [
        'Abre "Inicio" con la primera sede seleccionada y anota "Citas de hoy" e "Ingresos de hoy".',
        'Abre la tarjeta "Organización" y cambia a la segunda sede.',
        'Compara las mismas métricas ahora recargadas para la segunda sede.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Cambié de sede pero un módulo sigue mostrando la anterior.', fix: 'Vuelve a "Inicio", selecciona la sede y entra al módulo desde ahí. La sede activa se transmite en el enlace; abrir un módulo desde un enlace viejo puede conservar la sede anterior.' },
    { problem: 'No encuentro "Control de accesos" ni "Suscripciones".', fix: 'Ese grupo "Administración" solo aparece para el Owner. Si otro miembro del equipo lo necesita, debes darle rol de Owner o hacer tú el cambio.' },
  ],
  checklist: [
    { id: 'd6', label: 'Cambié de organización desde la tarjeta "Organización" y verifiqué que las métricas se recargaron.' },
    { id: 'd7', label: 'Abrí "Control de accesos" y revisé quién tiene acceso a la cuenta.' },
    { id: 'd8', label: 'Revisé el estado del plan en "Suscripciones".' },
  ],
};

const staff = {
  summary: {
    what: 'Tu Inicio es "Mi perfil profesional". Ahí defines cómo apareces ante los clientes, tu disponibilidad y ves los servicios que te asignó la administración.',
    forWhat: 'Sirve para mantener al día tu información y tus horarios, para que las reservas que recibes sean correctas.',
    whoUses: 'Cada profesional (barbero, estilista) sobre su propio perfil. No puedes ver ni editar el perfil de tus compañeros.',
  },
  screens: [
    {
      title: 'Mi perfil profesional',
      screenshot: {
        src: null,
        alt: 'Pantalla del profesional: encabezado con "Cuenta" y "Guardar"; tarjeta "Información personal" con nombre, apellido, nombre visible, teléfono, dirección, foto y biografía; tarjeta "Disponibilidad" con selector de días y horas de inicio y fin; a la derecha una vista previa del perfil, la lista de "Servicios asignados" y botones a Mis citas, Ingresos, Mis Reseñas y Guía.',
      },
      zones: [
        { n: 1, label: 'Botón "Guardar"', desc: 'guarda los cambios del perfil; se activa solo si hay cambios y no hay errores', xPct: 90, yPct: 8 },
        { n: 2, label: 'Información personal', desc: 'nombre, apellido, nombre visible, teléfono, dirección, foto y biografía', xPct: 33, yPct: 35 },
        { n: 3, label: 'Disponibilidad', desc: 'días disponibles y hora de inicio y de fin de tu jornada', xPct: 33, yPct: 68 },
        { n: 4, label: 'Vista previa y servicios asignados', desc: 'cómo te ven los clientes y qué servicios puedes atender', xPct: 82, yPct: 45 },
        { n: 5, label: 'Botones del portal', desc: 'Mis citas, Ingresos, Mis Reseñas y Guía', xPct: 82, yPct: 82 },
      ],
    },
  ],
  steps: [
    {
      id: 'd9',
      title: 'Completar tu perfil profesional',
      substeps: [
        'Abre "Mi perfil profesional" (tu pantalla de inicio).',
        'Llena "Nombre", "Apellido" y "Nombre visible" (así te ven los clientes al reservar).',
        'Escribe tu "Teléfono" con indicativo; la "Dirección" es opcional.',
        'Sube una foto en "Fotografía profesional" y escribe una "Biografía" corta (máximo 500 caracteres).',
        'Pulsa "Guardar".',
      ],
      expected: 'Aparece "Perfil actualizado" y la vista previa de la derecha muestra tus datos nuevos.',
    },
    {
      id: 'd10',
      title: 'Definir tu disponibilidad',
      substeps: [
        'Baja a la tarjeta "Disponibilidad".',
        'Selecciona los días en los que atiendes (al menos uno).',
        'Ajusta "Hora de inicio" y "Hora de fin"; la de fin debe ser posterior a la de inicio.',
        'Pulsa "Guardar".',
      ],
      expected: 'Los clientes solo pueden reservar contigo en los días y el horario que definiste.',
    },
    {
      id: 'd11',
      title: 'Entender qué gestiona la administración por ti',
      substeps: [
        'Revisa la tarjeta "Servicios asignados": es de solo lectura.',
        'Si falta un servicio o hay uno de más, pídele el cambio a la administración.',
        'Recuerda que las citas las agenda y cobra la administración; tú las consultas en "Mis citas".',
      ],
      expected: 'Sabes qué puedes cambiar tú (perfil y disponibilidad) y qué depende de la administración.',
    },
  ],
  buttons: [
    { icon: Save, name: 'Guardar', does: 'Guarda los cambios de tu perfil y disponibilidad.', when: 'Cada vez que cambias un dato; se activa solo si hay cambios y no hay errores.' },
    { icon: ShieldCheck, name: 'Cuenta', does: 'Abre "Cuenta y privacidad" para gestionar tus datos personales y tu sesión.', when: 'Cuando quieres cambiar datos de tu cuenta o revisar la privacidad.' },
    { icon: UserRound, name: 'Campos de "Información personal"', does: 'Nombre, apellido, nombre visible, teléfono, dirección y biografía definen cómo te presentas al cliente.', when: 'Al completar tu perfil por primera vez o cuando cambia un dato de contacto.' },
    { icon: RefreshCw, name: 'Fotografía profesional (subir / eliminar)', does: 'Sube o elimina tu foto de perfil.', when: 'Para que los clientes te reconozcan al reservar.' },
    { icon: CalendarDays, name: 'Selector de "Días disponibles"', does: 'Marca o desmarca cada día en el que atiendes.', when: 'Cuando cambia tu rutina semanal.' },
    { icon: Clock, name: 'Hora de inicio / Hora de fin', does: 'Define la franja horaria en la que los clientes pueden reservar contigo.', when: 'Al configurar tu jornada o cuando la ajustas.' },
    { icon: Scissors, name: 'Servicios asignados', does: 'Muestra, en solo lectura, los servicios que puedes atender.', when: 'Para consultar; los cambios los hace la administración.' },
    { icon: CalendarDays, name: 'Mis citas', does: 'Abre tu agenda personal con las citas asignadas a tu perfil.', when: 'Para ver tus citas de hoy, las próximas y el historial.' },
    { icon: WalletCards, name: 'Ingresos', does: 'Abre tu resumen de ingresos: comisiones, propinas y avance de meta.', when: 'Para revisar cuánto llevas ganado en el periodo.' },
    { icon: Star, name: 'Mis Reseñas', does: 'Muestra las reseñas y calificaciones que te han dejado los clientes.', when: 'Para revisar tu retroalimentación.' },
    { icon: BookOpen, name: 'Guía', does: 'Abre esta guía de uso de Nexus para tu rol.', when: 'Cuando tengas dudas sobre cómo funciona un módulo.' },
  ],
  examples: [
    {
      scenario: 'Vas a empezar a atender los sábados y ya no trabajas los lunes.',
      walkthrough: [
        'Abre "Mi perfil profesional" y baja a "Disponibilidad".',
        'Marca "Sáb" y desmarca "Lun".',
        'Revisa que las horas de inicio y fin sean correctas.',
        'Pulsa "Guardar" y confirma que aparece "Perfil actualizado".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'El botón "Guardar" está desactivado.', fix: 'Se activa solo cuando hay un cambio pendiente y todos los campos obligatorios están correctos. Revisa los mensajes en color ámbar debajo de cada campo.' },
    { problem: 'No puedo agregar un servicio a mi perfil.', fix: 'Es correcto: "Servicios asignados" es de solo lectura. Pídele a la administración que te asigne o quite servicios.' },
    { problem: 'No veo el módulo de Servicios ni el de Equipo.', fix: 'Esos módulos son solo para el Manager y el Owner. Como profesional, tú gestionas tu perfil y consultas tus citas, ingresos y reseñas.' },
  ],
  checklist: [
    { id: 'd9', label: 'Completé mi nombre visible, teléfono y biografía, y guardé.' },
    { id: 'd10', label: 'Subí mi foto profesional.' },
    { id: 'd11', label: 'Definí mis días disponibles y mi horario, y guardé.' },
    { id: 'd12', label: 'Revisé mis "Servicios asignados" y sé a quién pedir cambios.' },
  ],
};

const dashboard = {
  id: 'dashboard',
  perRole: {
    owner,
    manager,
    staff,
  },
};

export default dashboard;
