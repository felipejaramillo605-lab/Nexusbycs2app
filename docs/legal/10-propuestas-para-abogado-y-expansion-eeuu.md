# 10 — Propuestas pendientes de revisión de abogado y hoja de ruta para EE. UU.

> **Documento interno (apoyo técnico, no asesoría legal).** 2026-10-05. Lo que está aquí **no está publicado**: son textos y listas para que el abogado los valide antes de incorporarlos desde el panel Owner (Documentos legales).

## 1. Arbitraje (propuesta, NO publicada)
**Por qué no se publicó:** en contratos con consumidores una cláusula de arbitraje obligatorio puede considerarse abusiva en Colombia (revisar el Estatuto del Consumidor, Ley 1480 de 2011, normas sobre cláusulas abusivas; **no verificado en esta revisión**). Los Términos ya tienen **conciliación previa** (cláusula 16).

**Propuesta solo entre Nexus y el Negocio (B2B) en Colombia** — para sustituir o complementar la cláusula 16:
> Las controversias entre Nexus y el Negocio que no se resuelvan por conciliación en 30 días se someterán a **arbitraje en derecho**, con un árbitro, en [centro de arbitraje y conciliación de Medellín/Aburrá Sur — a definir], con sede en [municipio]. Lo anterior no limita los derechos de los consumidores ni de los titulares de datos, ni las competencias de la SIC.

**Pregunta al abogado:** ¿conviene el arbitraje B2B para una persona natural con ingresos bajos (costos del trámite frente a la jurisdicción ordinaria)? ¿Se mantiene solo conciliación?

## 2. Acciones colectivas
En Colombia existen las **acciones de grupo** (Ley 472 de 1998). Una cláusula de arbitraje no necesariamente las excluye frente a consumidores. **Consulta para el abogado**; no se redactó una renuncia.

## 3. Lista de verificación para operar en EE. UU. (dentro de ~1 año)
Todo marcado **revisar con un profesional**; no se verificaron cifras ni umbrales.
| Tema | Qué hacer | Estado |
|---|---|---|
| Entidad | Evaluar sociedad en Colombia que preste el servicio o entidad en EE. UU.; ver `08-persona-natural-y-tope-para-sociedad.md` | Pendiente |
| Agente DMCA | Designar agente en copyright.gov (costo y renovación a confirmar) y publicar su contacto en los Términos (cláusula 9 ya lo anticipa) | Pendiente |
| Privacidad estatal | Determinar qué leyes estatales aplican según el estado de los usuarios y los umbrales de cada ley (CCPA/CPRA en California y otras). El aviso 13 bis de la política ya declara: no vendemos ni compartimos para publicidad, derechos de acceso/eliminación, sin discriminación | Parcial |
| Mensajería comercial | TCPA (SMS/llamadas) y CAN-SPAM (correo): consentimiento expreso por escrito para marketing, mecanismo de baja funcional, dirección postal. Hoy: casilla de marketing no premarcada, baja por enlace, dirección postal exigida al negocio | Parcial |
| Menores | COPPA (< 13): el servicio es para mayores de 18; el registro debe pedir declaración de mayoría de edad | En tarea de Codex |
| Términos para usuarios de EE. UU. | Ley aplicable y fuero, limitación de responsabilidad, arbitraje y renuncia a acciones colectivas (exigibilidad varía por estado) | Pendiente de abogado |
| Impuestos | Impuesto a las ventas sobre SaaS y presencia fiscal según el estado | Pendiente de contador |
| Datos | Transferencia internacional: Colombia → EE. UU. ya está cubierta (SIC cita a EE. UU. con nivel adecuado, Circular Externa 005/2017); al revés, revisar si se tratan datos de residentes de la UE | Pendiente |
| Consentimiento de cookies/analítica | Hoy no hay analítica ni píxeles de terceros. Si se agregan (anuncios, medición), usar el marco de consentimiento (`ConsentBanner`) y actualizar política y subencargados | Marco en tarea de Codex |

## 4. Decisiones ya tomadas en esta ronda
- PostHog **eliminado** (grabaría sesiones sin consentimiento y contradecía la política). Para reactivarlo: consentimiento previo, sin grabación de sesiones, enmascarado y alta en subencargados.
- Fuentes **alojadas en el propio dominio** (OFL); sin llamadas a Google Fonts.
- Pendientes que **no** se resolvieron en código: el script de Emergent (`assets.emergent.sh/emergent-main.js`) cuya función exacta en producción hay que confirmar con Emergent; las imágenes versionadas en `data/` (licencias y fotos de personas reales: decidir con el dueño del contenido antes de sacarlas de Git, porque el despliegue podría borrarlas del contenedor).
