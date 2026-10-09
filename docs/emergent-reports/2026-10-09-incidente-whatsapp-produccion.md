# Incidente de producción — envío manual de WhatsApp

Fecha: 2026-10-09  
Estado: **ABIERTO — entrega bloqueada por respuesta 502 del origen**

## Alcance y salvaguardas

- Se usó exclusivamente el destinatario de prueba autorizado por el responsable.
- Se realizaron dos envíos de promoción técnica, cada uno con autorización humana explícita justo antes de enviar.
- No se modificaron secretos, plantillas, DNS, Cloudflare, despliegues ni datos de clientes.
- No se hizo un tercer intento para no crear duplicados.

## Resultado reproducible

1. El intento de recordatorio fue rechazado correctamente por Nexus con HTTP 400 porque no había una cita futura confirmada. No se originó un mensaje.
2. El primer intento de promoción devolvió en Nexus: `The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured.`
3. Un segundo intento autorizado, con la misma promoción técnica y el mismo destinatario de prueba, produjo exactamente el mismo error.
4. La consola del navegador registró un `AxiosError` HTTP 502 en cada promoción. El error 400 corresponde al recordatorio y es comportamiento esperado.

Conclusión: el fallo es reproducible y no es un doble clic ni un error transitorio de interfaz.

## Configuración y proveedores comprobados

- En Meta WhatsApp Manager, la plantilla genérica `aviso_general` está activa en Spanish y English (US), categoría Utility. No se modificaron plantillas.
- En Secretos de Emergent, el entorno **Live** contiene los secretos base: token de acceso, identificador de número, nombre de plantilla, secreto de app y token de verificación. Nunca se visualizaron ni se copiaron valores.
- Las variables de idioma no figuran explícitamente, pero el código tiene valores por defecto `es` y `en_US`; esto no explica por sí solo el 502.
- El editor de Emergent es un entorno Preview: allí las variables WhatsApp aparecen ausentes y los logs no incluyen la solicitud Live. No se debe usar esa ausencia como prueba de una mala configuración de producción.
- La analítica de Emergent disponible solo presenta tráfico, no trazas de backend ni logs de producción.
- La cuenta Cloudflare abierta no tiene zonas/dominios en `Domains Overview`; no administra `nexusbycs2.com` y no puede aportar eventos, Ray IDs ni configuración de proxy para esta incidencia.

## Código revisado

La ruta manual `POST /clients/{client_id}/messages/whatsapp`:

- exige rol de gestión, aislamiento de organización y plan Premium;
- resuelve el número únicamente desde base de datos;
- exige consentimiento para promoción y aplica reglas de país/horario;
- usa `profile_for` correctamente;
- transforma un rechazo normal de Meta en un HTTP 502 controlado sin filtrar detalle del proveedor.

El adaptador de Meta tenía una brecha de robustez: una respuesta HTTP exitosa pero truncada/no JSON podía lanzar `ValueError` al llamar `response.json()` y escapar hasta el proxy. Se preparó un cambio local que devuelve `invalid_provider_response` de forma controlada y una prueba unitaria con `httpx.MockTransport`. **Ese cambio aún no está publicado**, por lo que no puede explicar ni corregir el 502 Live actual hasta pasar revisión, CI y despliegue autorizado.

## Hipótesis ordenadas

1. **Origen Live/Emergent no responde o se interrumpe en esta ruta.** Es la hipótesis principal: Cloudflare muestra su página de origen inválido/incompleto, no el JSON controlado por Nexus.
2. **Excepción no capturada distinta al rechazo de Meta.** Debe confirmarse con logs Live del backend alrededor de los dos intentos. La corrección de decodificación no JSON cubre una variante, pero no diagnostica el proceso Live ya desplegado.
3. **Proxy o despliegue Live desalineado.** El editor Preview está en `main` según la comprobación previa, pero no demuestra qué artefacto ni qué variables utiliza el origen público.
4. **Meta/Graph API rechaza una versión, plantilla o credencial.** Es posible, pero normalmente Nexus debería devolver su 502 controlado; para confirmarlo se necesita el log sanitizado `whatsapp_rejected status=http_*` o `whatsapp_send_failed` del origen.

## Próximas comprobaciones necesarias

1. Obtener logs de **producción** de Emergent para la ventana de los dos intentos y buscar `whatsapp_`, traceback, reinicios de `backend` y errores del proxy.
2. Confirmar el artefacto/commit de producción y que carga los secretos Live sin revelar valores.
3. Identificar la cuenta que realmente gestiona la zona Cloudflare, si existe una; obtener Ray ID y timestamp del 502.
4. Revisar la versión de Graph API configurada en Live y la respuesta sanitizada de Meta.
5. Solo después de tener logs, crear PR para el manejo de respuesta no JSON, ejecutar CI y desplegar con autorización explícita. Repetir una única prueba solo si ya existe evidencia de que no se duplicó el envío previo.

---

## Análisis de Claude (2026-10-09) — causa más probable y cambio mínimo

### Qué cambia respecto a las hipótesis anteriores

La ruta `POST /clients/{client_id}/messages/whatsapp` **lanza ella misma un `HTTPException(502)`** cuando el envío no es aceptado por Meta (`if not result.get("accepted"): raise HTTPException(502, ...)`). Por tanto un 502 no demuestra que el origen se haya caído: es el estado que Nexus devuelve a propósito ante **cualquier** rechazo del proveedor.

Cloudflare reemplaza el cuerpo de las respuestas 502 del origen por su página de error (en JSON si la petición pide `Accept: application/json`, con el campo `detail` que el frontend muestra tal cual). Eso encaja exactamente con lo observado: el texto "The origin web server returned an invalid or incomplete response…" es **de Cloudflare**, no de Nexus, y el mensaje propio de Nexus ("No fue posible enviar WhatsApp; revisa la configuración del canal") nunca llegó al navegador. La respuesta quedó indistinguible de una caída real.

### Por qué la hipótesis "excepción no capturada / respuesta no JSON" es poco probable

Una excepción de Python sin capturar en una ruta de FastAPI devuelve **HTTP 500**, que Cloudflare normalmente deja pasar; no genera esta página de 502. El `ValueError` de `response.json()` caería en esa categoría (500). La corrección de Codex es válida como robustez, pero **no explica estos dos intentos**.

### Causa raíz más probable (a confirmar con el código de Meta)

Meta rechazó los dos envíos (HTTP 4xx), Nexus respondió su 502 controlado y Cloudflare lo disfrazó. Candidato principal visible hoy sin enviar nada: el paso **"Método de pago" figura como pendiente** en la cuenta de WhatsApp CS2 (`whatsapp_biz_onboarding_status`: "No payment method, so billable messages are accepted but the recipient will most likely not see them"). Meta responde con códigos como 131042 cuando falta o falla el pago. Otros candidatos, por orden: token de sistema sin el activo de la cuenta nueva asignado o vencido (190 / http_401), plantilla/idioma (132001, 132000), mensaje promocional con plantilla Utility (131049 u otra decisión de Meta). Los datos de la cuenta están bien: número `registered/linked`, webhook y suscripción hechos, app publicada, plantillas APROBADAS.

### Cambio mínimo aplicado en este PR

1. `client_whatsapp.py`: se responde **424** (no 502) con un mensaje seguro y accionable según el código de Meta (pago, token, plantilla, destinatario, límites…), por ejemplo "No fue posible enviar WhatsApp: la cuenta de WhatsApp Business no tiene un método de pago válido en Meta (código Meta 131042)". Nunca se expone el texto de la respuesta del proveedor ni credenciales.
2. `whatsapp_service.py`: se extraen solo los **códigos numéricos** `error.code` / `error.error_subcode` de Meta (`provider_code`, `provider_error_subcode`), se registran en el log `whatsapp_rejected` (ya sin datos personales) y se conserva la corrección de Codex: una respuesta exitosa no JSON, o JSON que no sea un objeto, devuelve `invalid_provider_response`.
3. Pruebas: rechazo con código 131042, causas conocidas y código desconocido, cuerpo no JSON y JSON no objeto, el límite de 256 KB del webhook (Codex).

### Qué hacer después de fusionar y republicar

1. Reintentar **un** envío de prueba (autorizado): el toast mostrará el motivo real y el código de Meta; no hace falta ver logs de producción.
2. Si el código es 131042: agregar/verificar el método de pago en la cuenta de WhatsApp (enlace del asistente de facturación de la cuenta 1426693246238156) y repetir.
3. Si es 190 / http_401: generar un token de usuario del sistema con permisos `whatsapp_business_messaging` y `whatsapp_business_management`, con la app y la cuenta 1426693246238156 asignadas, y actualizar `WHATSAPP_ACCESS_TOKEN` en Emergent (lo hace Felipe).
4. Confirmar el artefacto desplegado: tras republicar, el commit será el de este PR; antes de eso producción ejecuta `5db3a87`.
