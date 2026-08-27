// frontend/src/guide/guideContent/ingresos.jsx
import {
  CreditCard,
  WalletCards,
  HandCoins,
  ReceiptText,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trophy,
  Clock,
  Filter,
  X,
  Building2,
} from 'lucide-react';

const manager = {
  summary: {
    what: 'Ingresos reúne todos los cobros registrados: cuánto entró en total, cuánto es participación del negocio, cuánto son comisiones del equipo y cuánto son propinas, con el historial detallado y filtros por fecha, profesional y medio de pago.',
    forWhat: 'Sirve para ver cómo va la caja en un periodo y para revisar o anular un cobro puntual.',
    whoUses: 'El Manager (y el Owner), sobre todo al cerrar el día, la semana o el mes.',
  },
  screens: [
    {
      title: 'Panel de Ingresos',
      screenshot: {
        src: null,
        alt: 'Pantalla "Ingresos": encabezado "Finanzas · Ingresos" con un botón "Liquidaciones"; una barra de filtros con "Desde", "Hasta", un selector "Profesional", un selector "Medio" y un botón "Limpiar"; cuatro tarjetas: "Total recibido", "Participación negocio", "Comisiones Staff" y "Propinas"; una sección "Historial de cobros" con una tabla de Servicio, Pago, Fecha, Estado y Total, y paginación; al pulsar un monto se abre el detalle del cobro.',
      },
      zones: [
        { n: 1, label: 'Liquidaciones', desc: 'lleva al módulo de pagos al equipo (es otra cosa)', xPct: 85, yPct: 10 },
        { n: 2, label: 'Filtros', desc: 'Desde, Hasta, Profesional y Medio acotan todo el panel', xPct: 35, yPct: 22 },
        { n: 3, label: 'Tarjetas de totales', desc: 'Total recibido, Participación negocio, Comisiones Staff y Propinas', xPct: 50, yPct: 40 },
        { n: 4, label: 'Historial de cobros', desc: 'una fila por cada cobro del periodo filtrado', xPct: 50, yPct: 66 },
        { n: 5, label: 'Monto (Total)', desc: 'abre el detalle del cobro', xPct: 88, yPct: 66 },
        { n: 6, label: 'Paginación', desc: 'avanza entre páginas del historial', xPct: 75, yPct: 90 },
      ],
    },
    {
      title: 'Detalle del cobro y anulación',
      screenshot: {
        src: null,
        alt: 'Panel lateral "Detalle del cobro": lista con servicio, profesional, estado, precio original, descuento, valor neto, comisión staff, participación del negocio, propina, total recibido y medio de pago; abajo, un bloque "Anular transacción" con el botón "Anular". Al pulsarlo se abre una ventana que pide un "Motivo obligatorio", unas "Notas adicionales" y un botón "Confirmar anulación".',
      },
      zones: [
        { n: 1, label: 'Desglose del cobro', desc: 'cómo se reparte el total entre negocio, comisión y propina', xPct: 50, yPct: 35 },
        { n: 2, label: 'Anular', desc: 'abre la ventana de anulación', xPct: 75, yPct: 62 },
        { n: 3, label: 'Motivo obligatorio', desc: 'texto de al menos 5 caracteres', xPct: 50, yPct: 72 },
        { n: 4, label: 'Confirmar anulación', desc: 'excluye el cobro, restaura el inventario y reabre la cita', xPct: 70, yPct: 90 },
      ],
    },
  ],
  steps: [
    {
      id: 'r1',
      title: 'Ver los ingresos de un periodo',
      substeps: [
        'Abre "Ingresos" desde la barra lateral.',
        'Ajusta "Desde" y "Hasta" al periodo que quieres revisar.',
        'Lee las cuatro tarjetas de totales.',
        'Para volver al periodo por defecto (últimos 30 días), pulsa "Limpiar".',
      ],
      expected: 'Las tarjetas y el historial muestran solo los cobros de ese rango de fechas.',
    },
    {
      id: 'r2',
      title: 'Filtrar por profesional o por medio de pago',
      substeps: [
        'En la barra de filtros, elige un "Profesional" para ver solo sus cobros.',
        'O elige un "Medio" (Efectivo, Tarjeta, Transferencia, Nequi, Daviplata u Otro).',
        'Combina los filtros con el rango de fechas si lo necesitas.',
      ],
      expected: 'Todo el panel (tarjetas e historial) se recalcula con esos filtros.',
    },
    {
      id: 'r3',
      title: 'Entender las cuatro tarjetas',
      substeps: [
        '"Total recibido": todo lo que pagaron los clientes, propinas incluidas.',
        '"Participación negocio": la parte que queda para el negocio después de la comisión.',
        '"Comisiones Staff": lo que corresponde a los profesionales por sus servicios.',
        '"Propinas": lo que los clientes dejaron como propina.',
      ],
      expected: 'Sabes leer de dónde viene el dinero del periodo sin abrir cada cobro.',
    },
    {
      id: 'r4',
      title: 'Revisar el detalle de un cobro',
      substeps: [
        'En "Historial de cobros", pulsa el monto de la fila.',
        'En el panel lateral revisa el desglose: precio original, descuento, valor neto, comisión, negocio y propina.',
      ],
      expected: 'Ves exactamente cómo se repartió ese cobro.',
    },
    {
      id: 'r5',
      title: 'Anular un cobro',
      substeps: [
        'Abre el detalle del cobro y pulsa "Anular".',
        'Escribe un "Motivo obligatorio" de al menos 5 caracteres (por ejemplo, "cobro duplicado").',
        'Añade "Notas adicionales" si aplica y pulsa "Confirmar anulación".',
      ],
      expected: 'El cobro pasa a "Anulada" y deja de sumar; el inventario consumido se restaura y la cita se reabre. No se puede deshacer.',
    },
  ],
  buttons: [
    { icon: CreditCard, name: 'Liquidaciones', does: 'Lleva al módulo de liquidaciones (los pagos al equipo).', when: 'Cuando vas a pagar al equipo, no cuando revisas la caja.' },
    { icon: Filter, name: 'Campos "Desde" y "Hasta"', does: 'Acotan por fechas todas las tarjetas y el historial.', when: 'Al elegir el periodo a revisar.' },
    { icon: Filter, name: 'Selector "Profesional"', does: 'Muestra solo los cobros de un profesional.', when: 'Para revisar cuánto generó una persona.' },
    { icon: Filter, name: 'Selector "Medio"', does: 'Filtra por medio de pago: Efectivo, Tarjeta, Transferencia, Nequi, Daviplata u Otro.', when: 'Para cuadrar caja o conciliar un medio concreto.' },
    { icon: RefreshCw, name: 'Limpiar', does: 'Quita los filtros y vuelve al periodo por defecto (últimos 30 días).', when: 'Cuando terminas de revisar un filtro.' },
    { icon: WalletCards, name: 'Tarjeta "Total recibido"', does: 'Muestra todo lo cobrado en el periodo, propinas incluidas.', when: 'Es la cifra de referencia de la caja.' },
    { icon: ReceiptText, name: 'Tarjeta "Participación negocio"', does: 'Muestra la parte que queda para el negocio tras las comisiones.', when: 'Para ver la rentabilidad del periodo.' },
    { icon: CreditCard, name: 'Tarjeta "Comisiones Staff"', does: 'Muestra el total que corresponde a los profesionales.', when: 'Para anticipar lo que se liquidará al equipo.' },
    { icon: HandCoins, name: 'Tarjeta "Propinas"', does: 'Muestra el total de propinas del periodo.', when: 'Las propinas son del profesional, no del negocio.' },
    { icon: ReceiptText, name: 'Monto en "Historial de cobros"', does: 'Abre el panel lateral con el detalle de ese cobro.', when: 'Cuando necesitas ver cómo se repartió un cobro.' },
    { icon: ChevronLeft, name: 'Página anterior', does: 'Retrocede en el historial de cobros.', when: 'Para volver a cobros ya revisados.' },
    { icon: ChevronRight, name: 'Página siguiente', does: 'Avanza en el historial de cobros.', when: 'Para seguir revisando cobros más antiguos.' },
    { icon: RotateCcw, name: 'Anular', does: 'Abre la ventana de anulación del cobro.', when: 'Cuando un cobro se registró por error o duplicado.' },
    { icon: RotateCcw, name: 'Campo "Motivo obligatorio"', does: 'Guarda por qué se anula el cobro (mínimo 5 caracteres).', when: 'Obligatorio antes de confirmar la anulación.' },
    { icon: RotateCcw, name: 'Campo "Notas adicionales"', does: 'Guarda una aclaración opcional sobre la anulación.', when: 'Cuando hace falta más contexto.' },
    { icon: RotateCcw, name: 'Confirmar anulación', does: 'Anula el cobro, restaura el inventario y reabre la cita.', when: 'Cuando el motivo está escrito y estás seguro; no se puede deshacer.' },
    { icon: X, name: 'Cancelar / Cerrar (ventana de anulación)', does: 'Cierra la ventana sin anular nada.', when: 'Si abriste la anulación por error.' },
  ],
  examples: [
    {
      scenario: 'Es fin de mes y quieres saber cuánto entró, cuánto es del negocio y cuánto se le debe al equipo.',
      walkthrough: [
        'Abre "Ingresos" y pon "Desde" el día 1 y "Hasta" hoy.',
        'Lee "Total recibido", "Participación negocio" y "Comisiones Staff".',
        'Si quieres el detalle por persona, elige cada "Profesional" en el filtro.',
        'Para pagar al equipo, pasa a "Liquidaciones".',
      ],
    },
    {
      scenario: 'Registraste dos veces el mismo cobro de $25.000 en efectivo.',
      walkthrough: [
        'Filtra por "Efectivo" y por la fecha de hoy para encontrar el duplicado.',
        'Pulsa el monto de la fila repetida para abrir el detalle.',
        'Pulsa "Anular", escribe "cobro duplicado" en el motivo y pulsa "Confirmar anulación".',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Los ingresos no coinciden con lo que espero haber facturado.', fix: 'Solo cuentan las citas cerradas con "Completar y cobrar". Las citas confirmadas pero sin cobro registrado no aparecen aquí.' },
    { problem: 'Confundo "Ingresos" con "Liquidaciones".', fix: '"Ingresos" es lo que cobras a los clientes. "Liquidaciones" es lo que le pagas al equipo por sus comisiones y propinas. Son pantallas distintas.' },
    { problem: 'Anulé un cobro y quiero recuperarlo.', fix: 'La anulación no se deshace. Si el cobro sí ocurrió, vuelve a registrarlo desde la cita en "Agenda".' },
    { problem: 'El "Total recibido" me parece alto frente a la "Participación negocio".', fix: 'El total incluye propinas y comisiones del equipo, que no son del negocio. Compara con "Participación negocio" para ver lo que realmente queda.' },
  ],
  checklist: [
    { id: 'r1', label: 'Revisé los ingresos de un periodo ajustando "Desde" y "Hasta".' },
    { id: 'r2', label: 'Filtré por un profesional y por un medio de pago.' },
    { id: 'r3', label: 'Entendí qué significa cada una de las cuatro tarjetas.' },
    { id: 'r4', label: 'Abrí el detalle de un cobro y vi su desglose.' },
  ],
};

const owner = {
  summary: {
    what: 'Todo lo que ve el Manager en este módulo aplica para ti; además, como Owner los ingresos que ves corresponden a la organización seleccionada, así que revisas la caja sede por sede.',
    forWhat: 'Sirve para comparar la facturación y la rentabilidad de cada sede desde una sola cuenta. Para el detalle completo de cada botón y paso de este módulo, abre la vista "Guía del Manager" con el selector de arriba.',
    whoUses: 'El Owner, en los cierres de periodo y al comparar sedes.',
  },
  screens: [
    {
      title: 'Los ingresos son por organización',
      screenshot: {
        src: null,
        alt: 'Pantalla "Ingresos" del Owner: idéntica a la del Manager, pero las tarjetas y el historial corresponden a la organización activa. Al cambiar de sede en "Inicio", el panel se recarga con los cobros de esa sede.',
      },
      zones: [
        { n: 1, label: 'Organización activa', desc: 'define de qué sede son los ingresos; se elige en "Inicio"', xPct: 25, yPct: 12 },
        { n: 2, label: 'Tarjetas de totales', desc: 'solo los cobros de la sede seleccionada', xPct: 50, yPct: 40 },
      ],
    },
  ],
  steps: [
    {
      id: 'r6',
      title: 'Comparar la caja entre sedes',
      substeps: [
        'En "Inicio", selecciona la primera sede y abre "Ingresos".',
        'Fija el mismo rango de fechas y anota "Total recibido" y "Participación negocio".',
        'Vuelve a "Inicio", cambia a la otra sede y repite con el mismo rango.',
      ],
      expected: 'Comparas la facturación y lo que queda para el negocio en cada sede con el mismo criterio.',
    },
  ],
  buttons: [
    { icon: Building2, name: 'Selector de organización (en "Inicio")', does: 'Define de qué sede se muestran los ingresos.', when: 'Antes de entrar a "Ingresos" cuando administras varias sedes.' },
  ],
  examples: [
    {
      scenario: 'Quieres saber qué sede fue más rentable el mes pasado.',
      walkthrough: [
        'En "Inicio", selecciona la sede A y abre "Ingresos".',
        'Pon el rango del mes pasado y anota "Participación negocio".',
        'Cambia a la sede B en "Inicio" y repite con el mismo rango.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Veo cobros que no son de la sede que quería revisar.', fix: 'El panel sigue a la sede activa. Vuelve a "Inicio", selecciona la sede correcta y entra a "Ingresos" desde ahí.' },
  ],
  checklist: [
    { id: 'r5', label: 'Cambié de organización y confirmé que "Ingresos" mostró solo esa sede.' },
    { id: 'r6', label: 'Comparé "Total recibido" y "Participación negocio" de dos sedes con el mismo rango.' },
    { id: 'r7', label: 'Entendí que los filtros y el detalle son los mismos que ve el Manager.' },
  ],
};

const staff = {
  summary: {
    what: '"Mis ingresos" es tu resumen personal de dinero: lo que has generado, lo que está pendiente de liquidar y lo que ya te pagaron, con el detalle servicio por servicio y tu avance hacia la meta.',
    forWhat: 'Sirve para saber cuánto llevas ganado en el periodo y entender de qué se compone (comisión y propinas).',
    whoUses: 'Cada profesional sobre sus propios números. No puedes editar precios ni comisiones: eso lo define la administración.',
  },
  screens: [
    {
      title: 'Mis ingresos',
      screenshot: {
        src: null,
        alt: 'Pantalla "Finanzas personales · Mis ingresos": un botón "Reintentar"; un control con "Hoy", "7 días" y "30 días"; tarjetas de "Generado", "Comisiones", "Propinas" y "Pendiente", y una tarjeta "Meta semanal" o "Meta mensual" (según el periodo) con el porcentaje de avance si la administración fijó una; una sección "Ranking del equipo"; una lista "Servicios completados" con servicio, porcentaje de comisión y valor; y una lista "Liquidaciones" con el periodo, el estado y el total, que abre un detalle.',
      },
      zones: [
        { n: 1, label: 'Hoy / 7 días / 30 días', desc: 'cambia el periodo de todo el resumen', xPct: 25, yPct: 20 },
        { n: 2, label: 'Tarjetas de resumen', desc: 'Generado, Comisiones, Propinas y Pendiente', xPct: 50, yPct: 34 },
        { n: 3, label: 'Tarjeta "Meta semanal" / "Meta mensual"', desc: 'porcentaje de avance; el título cambia con el periodo; solo si la administración fijó una meta', xPct: 85, yPct: 34 },
        { n: 4, label: 'Ranking del equipo', desc: 'tu posición frente al resto (no aplica a "Hoy")', xPct: 45, yPct: 52 },
        { n: 5, label: 'Servicios completados', desc: 'cada servicio cobrado con su comisión y valor', xPct: 30, yPct: 74 },
        { n: 6, label: 'Liquidaciones', desc: 'los pagos que te han hecho; pulsa para ver el detalle', xPct: 75, yPct: 74 },
      ],
    },
  ],
  steps: [
    {
      id: 'r8',
      title: 'Ver cuánto llevas generado',
      substeps: [
        'Abre "Mis ingresos" (desde tu perfil o "Ingresos").',
        'Elige el periodo: "Hoy", "7 días" o "30 días".',
        'Lee la tarjeta "Generado".',
      ],
      expected: 'Ves el total que te corresponde por los servicios cobrados en ese periodo.',
    },
    {
      id: 'r9',
      title: 'Entender comisión, propina y pendiente',
      substeps: [
        '"Comisiones": tu parte por los servicios que hiciste.',
        '"Propinas": lo que los clientes dejaron para ti.',
        '"Generado" es la suma de las dos.',
        '"Pendiente": lo que aún no te han liquidado.',
      ],
      expected: 'Sabes de qué se compone tu dinero y cuánto falta por pagarte.',
    },
    {
      id: 'r10',
      title: 'Ver tu avance hacia la meta',
      substeps: [
        'Si la administración te fijó una meta, aparece la tarjeta "Meta semanal" o "Meta mensual" con el porcentaje.',
        'Debajo se muestra cuánto llevas frente al monto de la meta.',
        'El título de la tarjeta ("semanal" o "mensual") depende del periodo que definió la administración.',
      ],
      expected: 'Ves qué tan cerca estás de tu objetivo del periodo.',
    },
    {
      id: 'r11',
      title: 'Revisar tus liquidaciones',
      substeps: [
        'Baja hasta la lista "Liquidaciones".',
        'Pulsa una para abrir el detalle: comisiones, propinas, total, método y referencia.',
        'Fíjate en el estado: "Borrador", "Aprobada", "Pagada" o "Cancelada".',
      ],
      expected: 'Sabes qué te han pagado, cuándo y por cuánto.',
    },
  ],
  buttons: [
    { icon: Clock, name: 'Hoy / 7 días / 30 días', does: 'Cambia el periodo de todas las tarjetas y listas.', when: 'Según si quieres el dato del día o del mes.' },
    { icon: RefreshCw, name: 'Reintentar', does: 'Vuelve a cargar el resumen si algún dato no se pudo mostrar.', when: 'Si aparece un aviso amarillo de carga.' },
    { icon: WalletCards, name: 'Tarjeta "Generado"', does: 'Muestra la suma de tus comisiones y propinas del periodo.', when: 'Es tu cifra de referencia.' },
    { icon: ReceiptText, name: 'Tarjeta "Comisiones"', does: 'Muestra solo tu parte por los servicios.', when: 'Para separar comisión de propina.' },
    { icon: HandCoins, name: 'Tarjeta "Propinas"', does: 'Muestra el total de propinas que te dejaron.', when: 'Para saber cuánto de tu ingreso son propinas.' },
    { icon: Clock, name: 'Tarjeta "Pendiente"', does: 'Muestra lo que aún no te han liquidado.', when: 'Para saber cuánto te falta por cobrar.' },
    { icon: WalletCards, name: 'Tarjeta "Meta semanal" / "Meta mensual"', does: 'Muestra el porcentaje de avance hacia la meta que fijó la administración; el título indica si la meta es semanal o mensual.', when: 'Solo aparece si tienes una meta asignada.' },
    { icon: Trophy, name: 'Ranking del equipo', does: 'Muestra tu posición frente al resto por lo generado.', when: 'Con "7 días" o "30 días"; no aplica a "Hoy".' },
    { icon: ReceiptText, name: 'Lista "Servicios completados"', does: 'Muestra cada servicio cobrado con su porcentaje de comisión y su valor.', when: 'Para revisar servicio por servicio.' },
    { icon: ReceiptText, name: 'Fila de "Liquidaciones"', does: 'Abre el detalle de esa liquidación (comisiones, propinas, total, método, referencia).', when: 'Para revisar un pago que te hicieron.' },
  ],
  examples: [
    {
      scenario: 'Es viernes y quieres saber cuánto llevas esta semana y si vas a alcanzar tu meta.',
      walkthrough: [
        'Abre "Mis ingresos" y elige "7 días".',
        'Lee "Generado" y mira la tarjeta "Meta" para ver el porcentaje.',
        'Revisa "Servicios completados" para ver qué servicios sumaron más.',
      ],
    },
  ],
  pitfalls: [
    { problem: 'Mis números no cuadran con lo que esperaba.', fix: 'Solo cuentan los servicios que la administración ya cerró con su cobro. Una cita atendida pero sin cobro registrado todavía no suma.' },
    { problem: '"Pendiente" no baja aunque ya trabajé.', fix: '"Pendiente" es lo que aún no se ha incluido en una liquidación. Baja cuando la administración genera y paga la liquidación.' },
    { problem: 'No veo la tarjeta "Meta".', fix: 'La meta la fija el manager. Si no tienes una asignada, la tarjeta no aparece; pídesela a la administración si la necesitas.' },
    { problem: 'El "Ranking del equipo" está vacío.', fix: 'El ranking no aplica al filtro "Hoy". Cambia a "7 días" o "30 días".' },
  ],
  checklist: [
    { id: 'r8', label: 'Revisé "Generado" en los tres periodos (Hoy, 7 días, 30 días).' },
    { id: 'r9', label: 'Entendí la diferencia entre "Comisiones", "Propinas" y "Pendiente".' },
    { id: 'r10', label: 'Abrí una liquidación y vi su estado y su detalle.' },
  ],
};

const ingresos = {
  id: 'ingresos',
  perRole: {
    owner,
    manager,
    staff,
  },
};

export default ingresos;
