# FASE 7 — Preparación de migración fuera de Emergent

**Rama:** `emergent/fase7-migracion`. Nada de esto se ejecutó contra producción; la prueba de `mongodump`/`mongorestore` se hizo contra una base temporal ya eliminada.

## 1) Prueba de `mongodump` / `mongorestore`

| Paso | Resultado |
|---|---|
| `mongodump` de `test_database` (101 colecciones, 518 documentos, datos de Preview) | **0.48 s**, tamaño del dump: **824 KB** |
| `mongorestore` a una base temporal nueva (`fase7_migration_restore_test`) | **8.37 s** |
| Verificación | 101/101 colecciones y 518/518 documentos idénticos entre origen y restaurado |
| Limpieza | Base temporal y carpeta `/tmp` del dump eliminadas |

**Lectura para producción real:** al volumen actual (Preview/demo), el procedimiento es prácticamente instantáneo. El tiempo de `mongorestore` (8.37 s) está dominado por la creación de 101 colecciones e índices, no por el volumen de datos — con datos reales de producción (más documentos, mismo número de colecciones) el tiempo de restauración crecerá principalmente con el **tamaño de los índices**, no linealmente con la cantidad de filas. Para una migración real con tráfico de producción, usar `mongodump --oplog`/snapshot en caliente o una ventana de mantenimiento corta, no esta prueba a secas.

## 2) Inventario de dependencias propias de Emergent

| Dependencia | Dónde aparece | Uso real |
|---|---|---|
| `EMERGENT_LLM_KEY` | `backend/server.py:137`, `nexus_ai.py` | Clave administrada por Emergent para Nexus AI (chat/copiloto). El código ya llama a `litellm.acompletion(model="<provider>/<model>", api_key=EMERGENT_LLM_KEY, ...)` directamente — **no usa el paquete privado `emergentintegrations`** (confirmado: no está en `requirements.txt` ni se importa en ningún `.py`). |
| `auth.emergentagent.com` | `frontend/src/pages/Login.js:36` | Redirección al login social administrado por Emergent (Google). |
| `demobackend.emergentagent.com` | `backend/server.py:1100` | Intercambio de `X-Session-ID` por los datos de sesión (email/nombre/foto/token) tras el login social administrado por Emergent — comentario explícito en el código: `"DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS..."`. |
| `assets.emergent.sh/scripts/emergent-main.js` | `frontend/public/index.html` | Script inyectado por la plataforma (insignia "Made with Emergent" y/o telemetría del editor visual). No se investigó más a fondo qué hace exactamente ni si se puede quitar sin romper funciones de la plataforma (ver respuesta previa de soporte: contactar `support@emergent.sh` antes de tocarlo). |
| `.emergent/` (`emergent.yml`, `cron/watch_crons.sh`, `cron/webhook_crond.sh`) | raíz del repo | Metadatos y automatización propios de la plataforma Emergent (checkpoints, intento de instalar un cron en la imagen — ver informe FASE 2, hallazgo #2). No los usa el código de la app. |
| `PLATFORM_CAPABILITY_BOOTSTRAP_OWNER_ID` | `backend/.env`, `platform_capabilities.py` | Variable de bootstrap específica del modelo de "capacidades de plataforma" de Emergent (si aplica a su despliegue; no se investigó su alcance completo en este pase de solo lectura). |
| `R2_*` (Cloudflare R2) | `object_storage.py` | **No es Emergent** — es Cloudflare, API S3-compatible estándar (boto3). Sin lock-in. |
| `RESEND_*`, `SMTP_*` | `email_service.py` | **No es Emergent** — proveedores de correo estándar. Sin lock-in. |
| `WHATSAPP_*` | `whatsapp_service.py` | **No es Emergent** — API directa de Meta/WhatsApp Cloud. Sin lock-in. |
| Demonios (`reminder_daemon.py`, `low_stock_daemon.py`, `birthday_reminder_daemon.py`, `appointment_email_worker.py`) | `supervisor/conf.d/*.conf` | Procesos Python largos administrados por **supervisor** (estándar, no propietario de Emergent). No hay `.emergent/crons.yml` en uso — el agendamiento real del producto NO depende del cron-watcher de la plataforma. |

## 3) Qué reemplazar y cómo — tabla dependencia → alternativa → esfuerzo

| Dependencia | Alternativa fuera de Emergent | Esfuerzo |
|---|---|---|
| `EMERGENT_LLM_KEY` (Nexus AI) | Clave real de Anthropic/OpenAI/Gemini directamente en `LlmChat` (ya usa `litellm`, agnóstico de proveedor) — solo cambiar la variable de entorno y el `model=` si se quiere otro proveedor. | **Bajo** — 1 variable de entorno, sin tocar código salvo el nombre del modelo si cambia de proveedor. |
| Login social (`auth.emergentagent.com` + `demobackend.emergentagent.com`) | Integrar directamente **Google OAuth 2.0** (Google Cloud Console: client ID/secret propios) e implementar el intercambio de código por sesión en el propio backend. | **Medio** — reemplaza ~40 líneas en `Login.js` + el endpoint `/auth/session` en `server.py`; requiere crear credenciales OAuth propias y testear el flujo completo. |
| Almacenamiento (Cloudflare R2) | Ninguna — ya es independiente de Emergent. Solo mover las credenciales si se migra de cuenta de Cloudflare. | **Ninguno** |
| Correo (Resend/SMTP) | Ninguna — ya es independiente de Emergent. | **Ninguno** |
| WhatsApp (Meta Cloud API) | Ninguna — ya es independiente de Emergent. | **Ninguno** |
| Base de datos (MongoDB) | Cualquier MongoDB administrado (Atlas, self-hosted) — solo cambiar `MONGO_URL`. | **Bajo** — ver runbook de `mongodump`/`mongorestore` abajo. |
| Demonios/colas | Supervisor ya es portable (Docker/VM). En Kubernetes real, convertir cada `.conf` en un `Deployment` propio o `CronJob` si se prefiere agendamiento nativo en vez de procesos siempre-vivos. | **Bajo-Medio** — depende del orquestador destino. |
| Badge/script `assets.emergent.sh` | Quitar la etiqueta `<script>` de `index.html` (cosmético) — **pendiente confirmar con soporte de Emergent** si tiene efectos funcionales antes de quitarlo. | **Bajo** (una vez confirmado que es seguro) |
| `.emergent/` y `webhook-crond` | No se migran — son herramientas de la plataforma Emergent, no se usan fuera de ella. | **Ninguno** (se descartan) |
| `PLATFORM_CAPABILITY_BOOTSTRAP_OWNER_ID` | Evaluar si el modelo de "capacidades de plataforma" (`platform_capabilities.py`) tiene equivalente propio o si puede retirarse; no se profundizó en este pase. | **Por evaluar** |

## Runbook paso a paso (cuando se decida migrar)

1. **Base de datos:** crear un MongoDB destino (Atlas o self-hosted) → `mongodump --uri="$MONGO_URL_ORIGEN"` → `mongorestore --uri="$MONGO_URL_DESTINO" dump/` → verificar conteos de documentos por colección (como se hizo en este informe) → cambiar `MONGO_URL` en el entorno destino.
2. **Correo/Almacenamiento/WhatsApp:** copiar las variables `R2_*`, `RESEND_*`/`SMTP_*`, `WHATSAPP_*` al nuevo entorno sin cambios de código.
3. **Login social:** crear credenciales OAuth propias en Google Cloud Console; implementar el intercambio de código/token directamente en `/auth/session` (reemplaza la llamada a `demobackend.emergentagent.com`); actualizar `Login.js` para apuntar al nuevo flujo.
4. **Nexus AI:** reemplazar `EMERGENT_LLM_KEY` por una clave real del proveedor elegido; confirmar que el nombre de `model=` en `nexus_ai.py` es válido para esa clave.
5. **Demonios:** recrear los 4 procesos (`reminder_daemon.py`, `low_stock_daemon.py`, `birthday_reminder_daemon.py`, `appointment_email_worker.py`) como servicios siempre-vivos en el orquestador destino (systemd, Docker Compose, o Deployments de Kubernetes).
6. **Frontend:** quitar o conservar el script `assets.emergent.sh` según respuesta de soporte de Emergent; actualizar `REACT_APP_BACKEND_URL` al dominio nuevo.
7. **Validar:** correr la suite de pytest (`646/650` — ver FASE 1) y una pasada de humo del flujo de reserva pública contra el entorno destino antes de cortar tráfico real.

## Resumen de severidad
Sin hallazgos CRÍTICOS/ALTOS — el acoplamiento real a Emergent está concentrado en 2 piezas (login social y la clave de IA), ambas con alternativas de esfuerzo bajo/medio y ya aisladas en archivos pequeños y específicos. El resto del stack (BD, correo, almacenamiento, WhatsApp, colas) es ya portable sin cambios.

## Qué no se pudo verificar
- Qué hace exactamente `assets.emergent.sh/scripts/emergent-main.js` y si se puede retirar sin romper funciones de la plataforma (se recomendó previamente contactar a `support@emergent.sh`, no se tiene esa respuesta).
- Alcance completo de `PLATFORM_CAPABILITY_BOOTSTRAP_OWNER_ID` / `platform_capabilities.py` fuera de Emergent — no se profundizó por estar fuera del alcance de una auditoría de solo lectura.

Siguiente fase: FASE 8 (rendimiento con volumen).
