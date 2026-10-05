# Configuración de Despliegue - Nexus by CS2

## Variables de Entorno Requeridas

### Backend (`/app/backend/.env`)

**CRÍTICAS - Deben configurarse correctamente:**

```bash
# CORS y Orígenes de Confianza
CORS_ORIGINS="https://clipper-manage-1.emergent.host,https://listos-manager-reg.preview.emergentagent.com"
FRONTEND_URL="https://clipper-manage-1.emergent.host"

# Base de Datos
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"

# SMTP (no revelar valores)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<configurado>
SMTP_PASSWORD=<configurado>
SMTP_FROM_EMAIL=<configurado>
SMTP_FROM_NAME="Nexus by CS2"

# Almacenamiento durable de medios (Cloudflare R2, opcional; sin estas variables se usa solo el espejo en MongoDB)
R2_ACCOUNT_ID=<configurado>
R2_BUCKET=<configurado>
R2_ACCESS_KEY_ID=<configurado>
R2_SECRET_ACCESS_KEY=<configurado>
# Resend (opcional; sin estas variables todo el correo sale por SMTP como hoy)
EMAIL_PROVIDER=resend
RESEND_API_KEY=<configurado>
RESEND_FROM_EMAIL=<remitente verificado, p. ej. no-reply@mail.nexusbycs2.com>
RESEND_WEBHOOK_SECRET=<whsec_... del webhook https://nexusbycs2.com/api/webhooks/resend (eventos bounced, complained, delivered, delivery_delayed, suppressed)>

# LLM Key
EMERGENT_LLM_KEY=<configurado>

# Seguridad
SECURITY_OBSERVABILITY_KEY=<configurado>
SECURITY_EVENT_RETENTION_DAYS=90
```

### Frontend (`/app/frontend/.env`)

```bash
REACT_APP_BACKEND_URL=https://clipper-manage-1.emergent.host
```

## ⚠️ Puntos Críticos de Configuración

### 1. CORS_ORIGINS
- **NUNCA usar `"*"`** - el código de seguridad lo descarta
- Debe contener URLs exactas con scheme://host (sin rutas finales)
- Separar múltiples orígenes con comas
- Incluir tanto producción como preview para testing

### 2. FRONTEND_URL
- Debe coincidir con el dominio real desde donde se sirve el frontend
- Usado para:
  - Validación de origen en request_security
  - Links en emails (password reset, etc.)
  - Configuración CORS

### 3. Verificación después de Deploy

Después de actualizar variables de entorno:

```bash
# 1. Verificar que el backend cargó correctamente las variables
python3 -c "
from request_security import refresh_trusted_origins
result = refresh_trusted_origins()
print(f'TRUSTED_ORIGINS: {result}')
"

# 2. Reiniciar servicios
sudo supervisorctl restart backend
sudo supervisorctl restart frontend

# 3. Verificar logs
tail -n 50 /var/log/supervisor/backend.err.log
```

## Flujo de Validación de Origen

El middleware `request_security.py` valida:

1. **Para métodos mutadores (POST/PUT/PATCH/DELETE):**
   - Header `Origin` debe estar en `TRUSTED_ORIGINS`
   - O `Sec-Fetch-Site` debe ser "same-origin"
   - Cookies seguras requieren validación CSRF

2. **Casos especiales:**
   - `/api/auth/login`: Valida Origin si está presente
   - `/api/auth/session`: Valida Sec-Fetch-Site por OAuth
   - Requests sin cookie de sesión: más permisivos (Bearer auth)

## Troubleshooting

### Error: "Request origin is not allowed"

**Causas comunes:**
1. `CORS_ORIGINS` configurado como `"*"`
2. URL en `CORS_ORIGINS` no coincide exactamente con Origin del request
3. Falta protocolo (http/https) en la configuración
4. Backend no reiniciado después de cambiar .env

**Solución:**
```bash
# Verificar configuración actual
grep "CORS_ORIGINS\|FRONTEND_URL" /app/backend/.env

# Actualizar si es necesario
CORS_ORIGINS="https://clipper-manage-1.emergent.host"
FRONTEND_URL="https://clipper-manage-1.emergent.host"

# Reiniciar
sudo supervisorctl restart backend
```

### Manager no puede crear profesionales

**Checklist:**
1. ✅ Usuario tiene `organization_id` asignado en DB
2. ✅ Organización existe en colección `organizations`
3. ✅ CORS_ORIGINS configurado correctamente
4. ✅ Backend reiniciado después de cambios
5. ✅ Frontend NO envía organization_id (backend lo deriva)

**Verificar en DB:**
```javascript
// MongoDB
db.users.findOne({email: "manager@example.com"}, {organization_id: 1, role: 1})
db.organizations.findOne({organization_id: "org_xxxx"})
```

## Testing de Producción

### Pre-deploy Checklist
- [ ] Variables CORS_ORIGINS y FRONTEND_URL actualizadas
- [ ] Seed script ejecutado si DB está vacía
- [ ] Backend compila sin errores
- [ ] Frontend compila sin errores
- [ ] Test credentials documentados en `/app/memory/test_credentials.md`

### Post-deploy Verification
- [ ] Login funciona
- [ ] Manager puede ver lista de profesionales
- [ ] Manager puede crear nuevo profesional
- [ ] Logs backend muestran `action=created_successfully`
- [ ] No hay errores 403 "Request origin is not allowed"

## Notas de Seguridad

- ✅ Logs NO contienen: teléfonos, direcciones, bio, passwords, tokens, cookies
- ✅ Logs SÍ contienen: user_id, role, organization_id, barber_id, HTTP status, action
- ✅ CORS fail-closed: requiere orígenes explícitos
- ✅ RLS enforced: manager solo accede a su organización
- ✅ Validación de servicios: solo del mismo tenant

## Daemons administrados por Supervisor

Los procesos periódicos no se ejecutan dentro de `server.py`: el `lifespan`
web solo crea índices y hace bootstrap al inicio (`backend/server.py:171-175`).
En producción, Emergent los mantiene como procesos separados de Supervisor.
El repositorio confirma este patrón mediante `backend/low_stock_daemon.py:1`,
`backend/birthday_reminder_daemon.py:1`, `backend/membership_daemon.py:1`,
`backend/class_schedule_daemon.py:1` y `backend/reminder_daemon.py:1`; el
reporte operativo conserva como ejemplo `/etc/supervisor/conf.d/reminder_daemon.conf`
y `/var/log/supervisor/reminder_daemon.out.log` (`test_result.md:152-168`).

### Customer-risk daemon (apagado por defecto)

`backend/scoring_daemon.py` es un worker separado, de solo recomendaciones:
lee `MONGO_URL`/`DB_NAME`, corre cada seis horas y no crea reservas, mensajes ni
modifica clientes (`backend/scoring_daemon.py:31-59`). Solo ejecuta trabajo si
`CUSTOMER_RISK_DAEMON_ENABLED=true` (`:29-30`); sin esa variable su ciclo
termina como `mode=disabled`.

Antes de activarlo, un operador de Emergent debe crear una entrada Supervisor
separada, siguiendo el patrón existente y sin añadirlo al comando del backend:

```ini
[program:customer_risk_daemon]
directory=/app/backend
command=/usr/bin/python3 /app/backend/scoring_daemon.py
autostart=true
autorestart=true
startretries=3
stdout_logfile=/var/log/supervisor/customer_risk_daemon.out.log
stderr_logfile=/var/log/supervisor/customer_risk_daemon.err.log
environment=CUSTOMER_RISK_DAEMON_ENABLED="true"
```

La ruta de Python debe verificarse en el contenedor antes de guardar la
configuración. Tras `supervisorctl reread`, `supervisorctl update` y el arranque
del programa, revisar una ejecución completa en el log y confirmar que los
resultados se mantienen como recomendaciones. Mantener el kill-switch
`CUSTOMER_RISK_DAEMON_ENABLED=false` hasta que Owner autorice el piloto. No se
debe iniciar este worker en el proceso web, ni duplicarlo en más de un proceso
Supervisor sin un candado distribuido.
