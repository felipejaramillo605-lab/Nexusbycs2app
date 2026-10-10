# Canales de citas: correo y WhatsApp Premium

## Política de producto

- **Estándar:** confirmaciones, recordatorios y alertas operativas por correo electrónico. WhatsApp no se habilita.
- **Premium activo:** correo electrónico como canal base y WhatsApp como canal adicional configurable para confirmaciones, recordatorios y alertas de bajo stock.
- Una suscripción Premium en estado `active`, `trial` o `grace_period` habilita WhatsApp. Una suspensión, un plan Standard o la ausencia de suscripción no lo habilita.

## Controles de seguridad y entrega

La interfaz no decide el acceso: el backend consulta `organization_subscriptions` en cada envío y al guardar ajustes. Un Manager de Standard recibe `403` si intenta habilitar WhatsApp por API.

Para que un mensaje de cita salga por WhatsApp deben cumplirse todas estas condiciones:

1. La organización tiene Premium activo.
2. El Manager habilitó el canal correspondiente en Configuración.
3. El cliente no tiene baja de mensajería (`STOP`).
4. Cuando el perfil de país exige consentimiento, el cliente lo otorgó.
5. Meta aprobó la plantilla configurada y el canal Cloud API está operativo.

Correo no depende del resultado de WhatsApp: un error del proveedor o una plantilla pendiente no bloquea una reserva ni convierte una confirmación por correo en fallo.

## Configuración para Managers

En **Configuración → General**:

- Estándar ve el correo como canal base y un aviso que explica que WhatsApp requiere Premium. La casilla de WhatsApp de alertas de bajo stock permanece deshabilitada.
- Premium puede marcar de forma independiente WhatsApp para confirmaciones, recordatorios y alertas de bajo stock.

## Defensa en profundidad

La restricción se aplica en tres niveles:

1. La interfaz deshabilita los interruptores de WhatsApp fuera de Premium y evita mostrar como activa una preferencia antigua.
2. `PUT /organizations/{id}` rechaza intentos API de activar cualquier interruptor de WhatsApp para una cuenta Estándar y normaliza los indicadores persistidos a `false`.
3. El daemon mensual de bajo stock vuelve a consultar la suscripción antes de llamar a Meta. Así, una bandera persistida de versiones anteriores no permite un envío de WhatsApp fuera de Premium.

## Operación y despliegue

1. Abrir PR y fusionar a `main` tras CI verde.
2. En Emergent, usar **Republicar** para tomar el `main` fusionado; no editar directamente el workspace de Emergent.
3. Confirmar que una organización Premium puede guardar los dos interruptores y una Standard recibe el aviso/bloqueo.
4. Tras aprobación de Meta, hacer una única prueba al número autorizado y validar entrega + STOP.

No se incluyen secretos, tokens ni PINes en este documento.
