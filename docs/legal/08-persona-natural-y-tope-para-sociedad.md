# Operar Nexus como persona natural y cuándo crear una sociedad — Informe para el fundador

> **Informe de apoyo, no asesoría legal ni tributaria.** 2026-10-05. Valida cifras y decisiones con un **contador** y un **abogado**. Fuentes: DIAN (Resolución 000238 de 2025: UVT 2026 = **$52.374**), Ley 1258 de 2008 (S.A.S.), Código de Comercio (comerciantes y matrícula mercantil), Estatuto Tributario (Régimen Simple, IVA, facturación electrónica), Ley 1581 de 2012.

## 1. Idea central
Mientras Nexus tenga pocos o ningún ingreso, **operar como persona natural es razonable y legal**; no hace falta crear una sociedad desde el primer día. La desventaja es que la **responsabilidad es ilimitada**: deudas, reclamaciones y sanciones (la SIC puede multar hasta 2.000 salarios mínimos mensuales) se pueden cobrar contra el patrimonio personal. Por eso el "escudo" mientras no hay sociedad es **documental y operativo**, y se fija un **tope/gatillos** para constituirla.

## 2. Qué debe tener ya una persona natural que opera como negocio
| Tema | Qué hacer | Por qué |
|---|---|---|
| **Matrícula mercantil** | Quien ejerce el comercio de forma habitual y profesional debe matricularse en la Cámara de Comercio dentro del mes siguiente a iniciar actividades y renovar cada año (antes del 31 de marzo). Vender suscripciones de software es actividad comercial. | Obligación legal; evita sanciones y permite contratar y facturar con respaldo |
| **RUT** | Mantener actualizado con actividad económica relacionada (validar el código CIIU con el contador: desarrollo de software / procesamiento de datos y alojamiento) y responsabilidades. | DIAN |
| **Cuenta bancaria separada** | Usar una cuenta solo para Nexus (suscripciones, proveedores). | Orden contable y prueba de separación de gastos |
| **Contabilidad básica y soportes** | Registro de ingresos y gastos, contador al menos para declaraciones. | Renta, IVA y futura conversión a sociedad |
| **Facturación** | Está **obligada** a facturar electrónicamente la persona natural con ingresos brutos ≥ 3.500 UVT, o inscrita en el Régimen Simple, o responsable de IVA. Recomendado: facturar electrónicamente desde la primera venta (DIAN ofrece un facturador gratuito). | Profesionalismo y trazabilidad |
| **Régimen tributario** | Evaluar con el contador el **Régimen Simple de Tributación** (hasta 100.000 UVT) frente al ordinario. | Puede reducir carga y trámites |
| **Contratos B2B** | Términos y Anexo de Transmisión de Datos aceptados electrónicamente (documentos 02 y 03) con limitación de responsabilidad, indemnidad e instrucciones de datos. | Es el principal escudo contractual hoy |
| **Cumplimiento de datos** | Política, manual, protocolo de incidentes, retención, subencargados y consentimientos (documentos 01–07). | La mayoría de las reclamaciones y multas nacen de incumplimientos documentales |
| **Seguro** | Cotizar póliza de responsabilidad civil profesional / ciber (errores y omisiones, incidentes de datos). | Traslada el riesgo económico a una aseguradora |
| **Vivienda familiar** | Consultar al abogado si procede la **afectación a vivienda familiar** (Ley 258 de 1996) o patrimonio de familia inembargable, **de forma legítima y no como ocultamiento de bienes**. | Protección legal de la vivienda |
| **Minimizar el riesgo operativo** | No tratar datos sensibles; no operar en Florida/EE. UU.; no prometer SLA estrictos; limitar integraciones con datos de pago. | Menos exposición |

## 3. Cuándo crear la S.A.S. ("tope" y gatillos)
Cifras 2026 con **UVT = $52.374**:
| Umbral | UVT | Equivale a (COP) | Qué cambia |
|---|---|---|---|
| Declarante de renta (ingresos brutos) | 1.400 | ≈ **$73,3 millones / año** (≈ $6,1 M / mes) | Contabilidad e impuestos más exigentes |
| IVA y facturación electrónica obligatoria (persona natural) | 3.500 | ≈ **$183,3 millones / año** (≈ $15,3 M / mes) | Responsable de IVA (según actividad) y factura electrónica |
| Tope del Régimen Simple | 100.000 | ≈ $5.237 millones / año | Fuera de alcance por ahora |

**Recomendación de "tope" (el primero que ocurra):**
1. **Ingresos brutos de los últimos 12 meses ≥ 1.400 UVT (≈ $73 millones)** o ingresos mensuales sostenidos ≥ **$6 millones** durante 3 meses → **crear la S.A.S.** (y a más tardar antes de llegar a 3.500 UVT).
2. **Volumen de riesgo**, aunque no haya ingresos altos: **≥ 20 negocios pagando** o **≥ 10.000 clientes finales** en la base.
3. **Hitos contractuales o de riesgo:** (a) un cliente con varias sedes o cadena, o un contrato con indemnidad mayor a los ingresos de 12 meses; (b) la primera persona con acceso a datos de clientes (empleado o contratista); (c) inversión, socio o préstamo; (d) un incidente de seguridad o un reclamo/requerimiento de la SIC; (e) un proveedor o plataforma (Meta, pasarela de pagos) exige persona jurídica; (f) operación fuera de Colombia.
4. **Antes de activar Jev u otro proveedor de IA con datos reales de clientes** si se prevé tratar datos a escala.

**Si hoy no hay ingresos:** seguir como persona natural con matrícula mercantil, RUT, cuenta separada, contratos y documentos legales. Revisar estos gatillos **cada trimestre**.

## 4. Costos aproximados de crear la S.A.S. (referencia 2026; confirmar en la Cámara de Comercio)
- **Derechos de matrícula mercantil:** según los activos; para activos pequeños, del orden de $160.000–$450.000 (se renuevan cada año).
- **Impuesto de registro departamental:** 0,7 % del capital suscrito.
- Inscripción de documentos y libros: ≈ $120.000; formularios y certificados: ≈ $30.000.
- **Contador** mensual y declaraciones: lo que más pesa en el tiempo (consultar tarifas).
- Una S.A.S. unipersonal se constituye por **documento privado**, con un solo accionista y **responsabilidad limitada a los aportes** (Ley 1258 de 2008). **Ojo:** la protección se pierde ("levantamiento del velo") si hay fraude, abuso o mezcla de patrimonios: por eso conviene tener cuenta, contabilidad y contratos propios de la sociedad.

## 5. Qué pasa con los datos y contratos al constituir la sociedad
La S.A.S. sería el nuevo **Responsable/Encargado**: hay que (a) actualizar política, Términos y contrato de transmisión con la razón social y NIT; (b) cederle los contratos con los negocios y los de proveedores (con aviso a los clientes); (c) considerar el **RNBD** si supera el umbral de activos (las fuentes citan 610.000 UVT; otras, 100.000 UVT: validar); (d) trasladar cuentas de Cloudflare, Resend, Meta y dominios a la sociedad.

## 6. Resumen operativo
- **Hoy:** persona natural + matrícula mercantil + RUT + cuenta separada + documentos legales aceptados electrónicamente + seguro cotizado + abogado de datos.
- **Gatillo de sociedad:** ≥ 1.400 UVT (≈ $73 M) en 12 meses, o ≥ 20 negocios / ≥ 10.000 clientes finales, o un hito de riesgo de la sección 3.
- **Revisión:** cada trimestre y cada vez que se cierre un cliente grande.
