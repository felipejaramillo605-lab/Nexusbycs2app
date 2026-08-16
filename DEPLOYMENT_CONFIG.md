# Configuración de Despliegue - Nexus by CS2

## Variables de Entorno Requeridas

### Backend (`/app/backend/.env`)

**CRÍTICAS - Deben configurarse correctamente:**

```bash
# CORS y Orígenes de Confianza
CORS_ORIGINS="https://clipper-manage-1.emergent.host,https://clipper-manage-1.preview.emergentagent.com"
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
