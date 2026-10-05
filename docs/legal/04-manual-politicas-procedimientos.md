# Manual interno de Políticas y Procedimientos de Protección de Datos — Nexus by CS2 (v1)

> **BORRADOR PENDIENTE DE REVISIÓN LEGAL.** 2026-10-05. Documento interno exigido por el Decreto 1377 de 2013 (art. 13, compilado). Responsable de su aplicación: Felipe Jaramillo Parra. Canal de atención de titulares: nexusbycs2@gmail.com · +57 323 907 0485.

## 1. Principios que se aplican
Legalidad, finalidad, libertad (consentimiento), veracidad, transparencia, acceso y circulación restringida, seguridad y confidencialidad (Ley 1581, art. 4). Además: **minimización** (solo los datos necesarios), **responsabilidad demostrada** (poder probar lo que se hace) y **privacidad desde el diseño**.

## 2. Roles
| Rol | Quién | Responsabilidad |
|---|---|---|
| Responsable (cuentas de usuarios y plataforma) | Felipe Jaramillo Parra | Decide finalidades, mantiene este manual, responde ante la SIC |
| Encargado (datos de clientes finales de cada negocio) | Felipe Jaramillo Parra | Trata por cuenta de cada negocio según el contrato 03 |
| Oficial de datos (atención de solicitudes) | Felipe Jaramillo Parra (hasta que haya equipo) | Recibe, registra y responde solicitudes; coordina incidentes |
| Subencargados | Ver documento 07 | Contrato con deberes equivalentes |
| Acceso del equipo a datos | Solo quienes lo necesiten, con rol mínimo y registro | Confidencialidad firmada |

## 3. Inventario y registro de actividades
Mantener actualizado el inventario del documento 00 (categorías, titulares, ubicación, finalidad, retención) y la lista de subencargados (documento 07). Revisar **cada trimestre** y **ante cada proveedor, función o dato nuevo** (checklist de la sección 11).

## 4. Autorización
- Casillas **no premarcadas**; texto claro de la finalidad; enlace a la política.
- Se guarda: texto aceptado, versión, fecha/hora, IP, identificador del titular y del negocio.
- La publicidad requiere autorización específica y respeta la **Ley 2300** (horarios y festivos; el sistema bloquea envíos fuera de ventana).
- Revocatoria: tan fácil como otorgar (enlace de cancelar suscripción, respuesta a "BAJA", solicitud por canales). Se atiende de inmediato en el sistema y se confirma.

## 5. Atención de consultas y reclamos (procedimiento)
1. **Recepción** por correo, teléfono (+57 323 907 0485) o cuenta. Se asigna un número de radicado y se registra: fecha, titular, canal, derecho invocado.
2. **Verificación de identidad** proporcional (datos de la cuenta, documento solo si es indispensable).
3. **Clasificación:** consulta (10 días hábiles, prórroga de 5 con aviso) o reclamo (15 días hábiles, prórroga de 8). Reclamo incompleto: pedir subsanar en 5 días; a los 2 meses se entiende desistido.
4. **Si Nexus es Encargado:** en máximo 2 días hábiles se traslada la solicitud al negocio Responsable y se informa al titular; se ejecuta lo que el negocio instruya (rectificar/suprimir en 5 días hábiles).
5. **Reclamo en trámite:** se agrega la leyenda "reclamo en trámite" y no se circula el dato mientras se resuelve.
6. **Respuesta** por escrito, clara, por el medio indicado; se guarda copia **5 años**.
7. **Supresión:** alcanza base de datos, almacenamiento de imágenes (R2 y espejo), listas de supresión del proveedor de correo y proveedores de IA/hosting cuando aplique; los respaldos se sobrescriben en su ciclo (máx. 35 días). Se conserva lo que obligue una norma (p. ej. soportes contables del negocio) con el mínimo de datos.
8. **Indicadores:** número de solicitudes, tiempo de respuesta, vencidas (meta: 0).

## 6. Seguridad (medidas mínimas)
Control de acceso por roles y principio de menor privilegio; autenticación con Google o contraseña con hash; PIN con hash; sesiones con vencimiento; límite de intentos; cifrado en tránsito; secretos solo en el servidor (nunca en el cliente ni en el repositorio); aislamiento por organización probado con pruebas automáticas; auditoría de acciones sensibles y de **acceso de soporte** (solo lectura, 30 min, motivo obligatorio); copias de respaldo y prueba de restauración trimestral; revisión de dependencias vulnerables en cada versión; pruebas de seguridad previas a lanzar módulos nuevos.

## 7. Acceso de soporte a cuentas de negocios
Solo por el **modo visualización** (motivo escrito de al menos 10 caracteres, solo lectura, máximo 30 minutos, bloquea exportaciones y rutas de administración). Se prohíbe copiar datos de clientes finales a herramientas externas. El negocio puede pedir el extracto de accesos a su organización.

## 8. Capacitación y confidencialidad
Quien acceda a datos firma acuerdo de confidencialidad y recibe esta política. Repaso anual y ante cambios.

## 9. Proveedores
Antes de contratar: revisar país de tratamiento, política de retención, uso para entrenamiento de IA, contrato de transmisión/DPA, certificaciones y posibilidad de exportar/borrar. Registrar la decisión en el documento 07. **No se activan proveedores de IA con datos reales sin aviso de privacidad actualizado y enmascarado v2.**

## 10. Datos sensibles y menores
No se solicitan ni se permiten datos sensibles. Si aparecen, se alerta al negocio, se restringe el acceso y se suprimen a solicitud. Menores: solo con autorización del representante; sin marketing a menores sin autorización expresa del representante.

## 11. Lista de verificación para cualquier cambio (privacidad desde el diseño)
¿Qué dato nuevo se trata y para qué? ¿Es indispensable? ¿Hay base de autorización? ¿Quién es el Responsable? ¿Hay un proveedor nuevo y está en la lista? ¿Se actualizó política/contrato/retención? ¿Se puede suprimir y exportar? ¿Hay pruebas? ¿Se probó un caso de abuso?

## 12. Incidentes
Aplicar el protocolo del documento 05.

## 13. Auditoría y mejora
Revisión trimestral de este manual, de la lista de subencargados y de los indicadores; auditoría interna anual de accesos y de supresiones; actualizar tras cambios legales (en especial la reforma de la Ley 1581 y las normas de IA que se aprueben).

## 14. Evidencias que se conservan (responsabilidad demostrada)
Versiones de documentos y sus fechas, aceptaciones electrónicas, registro de solicitudes y respuestas, bitácora de incidentes, listas de subencargados y contratos, resultados de pruebas de seguridad y de restauración, capacitaciones.
