# 🔧 Guía de Debugging - Settings Module

## ✅ CORRECCIONES APLICADAS

### 1. **PROBLEMA CRÍTICO #1: Endpoint de Cambio de Rol**
**Error Original:**
```javascript
// ❌ INCORRECTO - Enviaba role como JSON body
fetch('/api/owner/users/{id}/role', {
  method: 'PUT',
  body: JSON.stringify({ role: newRole })
})
```

**Corrección Aplicada:**
```javascript
// ✅ CORRECTO - role como query parameter
fetch('/api/owner/users/{id}/role?role={newRole}', {
  method: 'PUT',
  credentials: 'include'
})
```

**Razón:** El backend espera el parámetro `role` directamente en la función:
```python
async def update_user_role(user_id: str, role: str, ...)
```

---

### 2. **LOGGING DETALLADO AÑADIDO**

Todos los bloques `catch` ahora incluyen logs con emoji para fácil identificación:

```javascript
console.error('❌ ERROR AL ACTUALIZAR PERFIL:', {
  status: response.status,
  statusText: response.statusText,
  errorData: errorData,
  sentData: profileData,
  organizationId: organizationId
});
```

**Qué revisar en la consola:**
- 🟢 `✅ Organization data loaded:` - Carga exitosa
- 🟢 `✅ Team members loaded:` - Equipo cargado
- 🔴 `❌ ERROR AL ACTUALIZAR PERFIL:` - Fallo en guardado de perfil
- 🔴 `❌ ERROR AL ACTUALIZAR ROL:` - Fallo en cambio de rol
- 🔴 `❌ CATCH ERROR:` - Error de red o excepción

---

### 3. **VERIFICACIÓN DE PERMISOS (RLS)**

**Endpoint de Organización:**
```python
# Backend valida:
if current_user.get("organization_id") != organization_id and current_user.get("role") != "owner":
    raise HTTPException(status_code=403, detail="Access denied")
```

**Requisitos:**
- ✅ Usuario debe pertenecer a la organización
- ✅ O ser Owner (puede editar cualquier org)
- ✅ Debe tener sesión activa (cookies)

**Endpoint de Roles:**
```python
# Backend valida:
if current_user.role not in ["owner", "admin"]:
    raise HTTPException(status_code=403, detail="Access denied")
```

**Requisitos:**
- ✅ Usuario debe ser Owner o Admin
- ✅ Rol válido: "owner", "manager", "admin", "staff"

---

## 🧪 CÓMO PROBAR LAS CORRECCIONES

### **Paso 1: Verificar Sesión Activa**
```javascript
// En la consola del navegador:
document.cookie
// Debe mostrar algo como: session_token=abc123...
```

### **Paso 2: Verificar Organization ID**
```javascript
// En Settings.js, añadir temporalmente:
console.log('Current Org ID:', organizationId);
console.log('Current User:', user);
```

### **Paso 3: Probar Actualización de Perfil**
1. Ir a `/manager/settings`
2. Cambiar nombre, teléfono o dirección
3. Click "Guardar Cambios"
4. Abrir DevTools Console (F12)
5. Revisar logs:
   - ✅ Success: Toast verde "Perfil actualizado correctamente"
   - ❌ Error: Ver objeto completo con status, errorData, etc.

### **Paso 4: Probar Cambio de Rol**
1. En la lista de miembros del equipo
2. Cambiar rol con el dropdown
3. Revisar console:
   - ✅ Success: Toast "Rol actualizado correctamente"
   - ❌ Error: Ver endpoint completo llamado

---

## 🔍 ERRORES COMUNES Y SOLUCIONES

### **Error 403: Access Denied**
**Causa:** Usuario no tiene permisos
**Solución:**
- Verificar que el usuario sea Owner/Admin
- Verificar que pertenezca a la organización correcta
- Revisar `user.role` y `user.organization_id`

### **Error 404: Not Found**
**Causa:** Organization ID o User ID incorrecto
**Solución:**
- Verificar que `organizationId` esté presente
- Usar `?org_id=` en la URL para owners
- Revisar logs: `organizationId: ...`

### **Error 400: No fields to update**
**Causa:** Todos los campos están vacíos o None
**Solución:**
- Asegurar que al menos un campo tenga valor
- Revisar `profileData` en los logs

### **Error 400: Invalid role**
**Causa:** Rol no está en la lista permitida
**Solución:**
- Roles válidos: owner, manager, admin, staff
- Revisar `newRole` en los logs del error

### **Error de CORS / Network**
**Causa:** Problema de conectividad o CORS
**Solución:**
- Verificar que `credentials: 'include'` esté presente
- Revisar variable `REACT_APP_BACKEND_URL`
- Verificar que el backend esté corriendo

---

## 📊 ESTRUCTURA DE DATOS ESPERADA

### **Payload de Organización:**
```json
{
  "name": "Barbería Premium",
  "phone": "+57 300 123 4567",
  "address": "Calle 123 #45-67, Bogotá"
}
```

### **Schema del Backend (OrganizationUpdate):**
```python
class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    business_hours: Optional[str] = None
    whatsapp_link: Optional[str] = None
```

✅ **Coincidencia perfecta:** `phone` ↔ `phone`, `address` ↔ `address`

---

## 🎯 CHECKLIST FINAL

Antes de reportar un bug, verificar:
- [ ] ¿Hay sesión activa? (`document.cookie`)
- [ ] ¿El usuario tiene el rol correcto? (Owner/Admin)
- [ ] ¿Los logs en console muestran el error detallado?
- [ ] ¿El endpoint llamado es correcto? (revisar URL completa)
- [ ] ¿Los datos enviados coinciden con el schema?

Si todo esto está correcto y sigue fallando, compartir:
1. Screenshot de los logs completos de la consola
2. El rol del usuario actual
3. El organization_id intentando modificar
