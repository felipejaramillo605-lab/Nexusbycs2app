# FASE 3 — Auditoría de configuración (solo nombres, sin valores)

**Alcance:** nombres de variables de entorno presentes vs. las que el código realmente lee. Ningún valor se mostró ni se registró en este informe.

## Backend (`backend/.env`) — usadas vs. ausentes

| Variable presente en `.env` | ¿La lee el código? |
|---|---|
| CORS_ORIGINS | OK |
| DB_NAME | OK |
| EMAIL_PROVIDER | OK |
| EMERGENT_LLM_KEY | OK |
| FRONTEND_URL | OK |
| MONGO_URL | OK |
| PLATFORM_CAPABILITY_BOOTSTRAP_OWNER_ID | OK (bootstrap de capacidad de plataforma, por diseño solo se usa cuando se setea como secreto de despliegue) |
| R2_ACCESS_KEY_ID | OK |
| R2_ACCOUNT_ID | OK |
| R2_BUCKET | OK |
| R2_SECRET_ACCESS_KEY | OK |
| RESEND_API_KEY | OK |
| RESEND_FROM_EMAIL | OK |
| RESEND_WEBHOOK_SECRET | OK |
| SECURITY_EVENT_RETENTION_DAYS | OK |
| SECURITY_OBSERVABILITY_KEY | OK |
| SMTP_FROM_EMAIL / SMTP_FROM_NAME / SMTP_HOST / SMTP_PASSWORD / SMTP_PORT / SMTP_USER | OK |
| UNSUBSCRIBE_TOKEN_SECRET | OK (firma HMAC de bajas de marketing) |
| WHATSAPP_ACCESS_TOKEN / WHATSAPP_APP_SECRET / WHATSAPP_GENERIC_TEMPLATE_NAME / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_VERIFY_TOKEN | OK |

**Ninguna variable presente está "sin uso".**

### Variables que el código espera pero NO están en `backend/.env` (usan su propio default interno, por eso el backend sigue arrancando)
| Variable | Dónde se lee | Riesgo |
|---|---|---|
| R2_ENDPOINT | `object_storage.py` | FALTA, pero es opcional: si falta se deriva de `R2_ACCOUNT_ID` automáticamente. OK. |
| WHATSAPP_API_VERSION, WHATSAPP_GRAPH_API_BASE_URL, WHATSAPP_TEMPLATE_LANGUAGE, WHATSAPP_TEMPLATE_LANGUAGE_EN | `whatsapp_service.py`/similar | FALTA, usan default interno del código. RIESGO BAJO — revisar si el default coincide con la plantilla real aprobada (`aviso_general`, es/en_US) antes de activar WhatsApp en producción. |
| APPOINTMENT_EMAIL_* (6 vars), SUBSCRIPTION_* (6 vars), DECISION_ENGINE_ENABLED, JEV_API_KEY, LEGAL_DOCS_VERSION, NEXUS_*_MEDIA_ROOT/NEXUS_MEDIA_PLAN_TTL_SECONDS, BILLING_SELLER_* | varios módulos | FALTA, todos tienen default interno razonable para Preview (rutas de medios locales, intervalos de worker, etc.). RIESGO BAJO. |
| COOKIE_SECURE | `server.py` | FALTA → default `true` (cookies `Secure`, correcto para producción HTTPS). RIESGO: ninguno en Preview/producción reales (ambas son HTTPS); solo afecta si alguien corre el backend manualmente sobre `http://` plano (ver informe FASE 1, hallazgo #2). |
| NEXUS_TEST_MONGO_URL | usada solo en CI (`ci.yml`) | No aplica a este pod. |

## Frontend (`frontend/.env`)
| Variable | ¿La lee el código? |
|---|---|
| REACT_APP_BACKEND_URL | OK (todas las llamadas API) |
| ENABLE_HEALTH_CHECK | No se encontró ningún `process.env.ENABLE_HEALTH_CHECK` en `src/`. Es una variable de build/infra de la plataforma (probablemente usada por el pipeline de salud, no por el código React). INFO, no es un riesgo. |
| WDS_SOCKET_PORT | Variable estándar de Webkit Dev Server (CRA), no se lee desde `process.env` en el código de la app — la consume el propio dev-server. OK. |

**Nota:** El código usa `process.env.REACT_APP_BACKEND_URL` y `process.env.NODE_ENV`; `NODE_ENV` no aparece en el `.env` porque React/CRA la inyecta automáticamente (dev/production) — no requiere declaración.

**Ninguna variable presente en `frontend/.env` está vacía ni sin uso real.**

## CORS, cookies y puertos — checklist

| Ítem | Estado | Detalle |
|---|---|---|
| CORS — `allow_origins` | OK | `CORSMiddleware` usa `TRUSTED_ORIGINS`, derivado de `CORS_ORIGINS`/`FRONTEND_URL` (`request_security.refresh_trusted_origins`), no un wildcard `*`. |
| CORS — `allow_credentials` | OK | `True`, coherente con el uso de cookies de sesión. |
| Cookie `session_token` — `HttpOnly` | FALTA VERIFICAR EN CÓDIGO | No se encontró `httponly=True` explícito en las llamadas a `response.set_cookie` en `server.py` (línea ~1160, ~1254, ~7798, ~7899). FastAPI/Starlette por defecto pone `httponly=True` en `set_cookie` **salvo que se pase `httponly=False` explícitamente** — no se encontró ningún `httponly=False`, así que el comportamiento por defecto (protegida) aplica. RIESGO: ninguno detectado, pero se recomienda hacerlo explícito en el código por claridad (fuera del alcance de esta auditoría de solo lectura). |
| Cookie `session_token` — `Secure` | OK | `secure=COOKIE_SECURE`, `true` por defecto. |
| Cookie `session_token` — `SameSite` | OK | `"none" if COOKIE_SECURE else "lax"` — correcto para un flujo cross-site de portal público embebido/iframe cuando la cookie es `Secure`. |
| `FRONTEND_URL` | OK | Apunta al dominio real de Preview, usado para construir enlaces de correo (confirmación, cancelación, baja). |
| Puertos | OK | Backend `:8001` (uvicorn, `--reload`, 1 worker), frontend `yarn start` (CRA dev server), MongoDB `mongod --bind_ip_all` — todos coinciden con lo esperado por el entorno Kubernetes de Emergent. |
| Procesos supervisados | OK | `backend`, `frontend`, `mongodb`, `reminder_daemon`, `low_stock_daemon`, `birthday_reminder_daemon`, `appointment_email_worker`, `code-server`, `webhook-crond`, `nginx-code-proxy` — todos `RUNNING` (ver FASE 2). |

## Qué debe hacer Felipe (sin valores)
1. Antes de activar WhatsApp en producción: confirmar que `WHATSAPP_API_VERSION`/`WHATSAPP_GRAPH_API_BASE_URL` por defecto en el código coinciden con la versión de Graph API real que Meta aprobó para la plantilla `aviso_general`.
2. Decidir si quiere declarar explícitamente `COOKIE_SECURE`, `WHATSAPP_API_VERSION` y las demás variables "con default interno" en `backend/.env` por trazabilidad, aunque hoy no causan ningún fallo.
3. Nada que cambiar en CORS, puertos o configuración de despliegue — todo OK.

## Resumen de severidad
CRÍTICA: 0 · ALTA: 0 · MEDIA: 0 · BAJA: 2 (confirmar versión de Graph API de WhatsApp antes de ir a producción con esa integración; hacer explícito `httponly`) · OK: resto.

Ningún cambio de código en esta fase (solo lectura).

Siguiente fase: FASE 4 (E2E en Preview).
