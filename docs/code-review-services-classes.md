# Tarea 1 — Revisión de Servicios y Clases

Fecha: 2026-09-22. Base revisada: `818b1828a79a124664c9e66c512141cc5d50a801` (`origin/main`). Rango solicitado: `ec70eb2` → `818b182`, incluidas Fases 1–5 y PR #15–#18. Rama: `review/services-classes-followup`. Este PR solo documenta: no aplica fixes ni sustituye la auditoría de seguridad de la Tarea 2.

## Hallazgos confirmados

### R1 — Alto: cancelar dos veces puede liberar dos cupos y devolver dos usos

**Ubicación:** `backend/server.py:3855–3874`; entradas pública `3924–3928` y autenticada `4586–4593`.

Las rutas leen una reserva `confirmed` antes de llamar al helper. Dos solicitudes simultáneas pueden leer el mismo estado. El helper actualiza únicamente por `class_booking_id`, sin exigir que siga confirmada ni comprobar que esta solicitud ganó la transición. Ambas solicitudes decrementan `booked_count`, devuelven un uso de membresía y llaman a promoción. El filtro `booked_count > 0` evita negativos, pero no evita liberar el cupo de otro inscrito.

**Evidencia aislada:** ejecutar el helper real dos veces con las instantáneas confirmadas que pueden leer esas solicitudes produjo dos llamadas de decremento de cupo, dos devoluciones de membresía y dos promociones para una sola reserva. Con contador inicial 2 y consumo inicial 2, las condiciones permiten ambos decrementos aunque solo se cancele una reserva. Se usaron dobles de base de datos; no se ejecutó una carrera contra MongoDB real.

**Fix separado recomendado:** transición atómica `confirmed → cancelled`, condicionada al estado previo; solo el ganador aplica efectos. Asegurar recuperación/idempotencia entre escrituras. Regresión: dos cancelaciones concurrentes devuelven exactamente un cupo/un uso y promueven una sola vez.

### R2 — Alto: el checkout aún permite cobrar una reserva cubierta por membresía

**Ubicación:** `backend/server.py:3935–4022`; protección exclusivamente visual en `frontend/src/pages/ManagerClasses.js:435–440`.

El PR #15 oculta «Cobrar» cuando `payment_method === 'membership'`. El endpoint solo rechaza una transacción previa; una reserva cubierta tiene `transaction_id=None`, por lo que una llamada directa de un manager autorizado con `payment_method='cash'` crea una transacción adicional y cambia la reserva a `completed`. El comentario que presupone que nunca llegan membresías no es una validación.

**Evidencia aislada:** ejecutar el endpoint real sin sus decoradores, con autorización válida simulada, reserva cubierta y servicio de 50.000 COP, retornó `total_received=50000` e invocó la inserción de una transacción. No se hizo un cobro externo ni se usaron datos reales.

**Fix separado recomendado:** rechazar en backend el checkout de reservas cubiertas, antes de persistir; probar tanto membresía como pago del día. La ocultación del botón debe mantenerse como ayuda visual.

### R3 — Medio: cancelación tardía calculada en UTC en vez de la zona del negocio

**Ubicación:** `backend/server.py:3732–3740`; zona de organización ya disponible en `7999–8002`.

`_is_late_cancellation` interpreta `session.date/time` con `.replace(tzinfo=timezone.utc)`, aunque la agenda usa la hora local del negocio. En Bogotá, una clase del 22/09/2026 a las 18:00 con corte de 2 horas todavía admite devolución a las 13:00 locales. El helper, evaluado a las 18:00 UTC (13:00 Bogotá), devuelve `True`: la considera tardía cinco horas antes de lo debido. Esto impide devolver un beneficio que aún corresponde.

**Evidencia:** función real ejecutada con reloj fijo, resultado `True` frente a `False` esperado. **Fix separado recomendado:** resolver la zona IANA de la organización, interpretar allí la sesión y comparar instantes; probar Bogotá y una zona con cambio estacional.

### R4 — Medio: no se puede editar la descripción breve de un servicio existente

**Ubicación:** `frontend/src/pages/ManagerServices.js:95,126,340–351,429–596`.

Crear Servicio usa correctamente `newService.short_description` desde #17. Editar carga y reenvía `editingService.short_description`, pero no ofrece un control para cambiarlo. Reproducción: crear con descripción, abrir Editar y buscar el campo; solo está en Crear. Un manager no puede corregir el texto que aparece en las tarjetas del portal.

**Fix separado recomendado:** textarea dentro del bloque protegido `{editingService && (...)}`, con `editingService/setEditingService` y límite 280. `image_alt` y `image_focal_point` **sí existen** en Editar (`513,516`), visibles para servicios grupales; no hay que duplicarlos. Portada/banner también están en ese bloque.

## Observación de contrato — Bajo, sin rotura actual demostrada

### R5 — `service_presentation` no está en todas las respuestas de sesión

La búsqueda completa de `class_sessions` en backend identificó estos contratos:

| Respuesta | Proyección | Referencia en `backend/server.py` |
|---|---|---|
| GET `/public/clients/class-sessions` | Sí | 3355–3419, proyección en 3393 |
| GET `/public/{org_id}/class-sessions` | Sí | 3557–3595, proyección en 3591 |
| GET `/class-sessions` | No; sesiones sin enriquecer | 3170–3190 |
| GET `/class-sessions/{id}/bookings` | No en `session` | 3323–3343 |
| POST `/class-sessions`, PUT `/class-sessions/{id}` | No; documento creado/actualizado | 3167,3295 |

Las respuestas de reservas devuelven reservas, las de plantillas devuelven plantillas/conteos y las cancelaciones devuelven resúmenes. `class_schedule.py` genera sesiones internamente y el bloque `server.py:8124–8141` calcula ocupación de agenda: no son superficies de presentación omitidas.

El helper dice «every group-session endpoint», pero solo lo usan los dos listados de clientes. **No es un fallo visible hoy:** `ManagerClasses.js:47,202,322,420` carga servicios en lote y resuelve nombre/detalle por `service_id`. Acordar si el contrato común también abarca gestión antes de extenderlo; no convertir esta diferencia, por sí sola, en un fix urgente.

## Comprobaciones pedidas sin hallazgo adicional confirmado

- **Estados cruzados como #17:** `ManagerBarbers.js:582–600` pasa `newBarber/setNewBarber` en Crear y protege `editingBarber` antes de montar Editar. `ManagerCatalog.js:30–36,300–444` utiliza `form` inicializado para crear/editar, `stockForm` separado y protege las fotos con `editor?.product_id`. `ManagerInventory.js:38–39,52–59,68–83` mantiene `form`, `moveForm` y `auditForm` separados. No encontré otra referencia del estado de edición nulo dentro de Crear en esos consumidores.
- **Scroll de #18:** `components/ui/dialog.jsx:32` añade límite de altura/scroll. Barbers ya establece scroll en sus tres diálogos; Catalog lo establece en el editor; Inventory en auditoría/reorden. Sus selectores son `<select>` nativos y las ayudas `FieldGuide` están en flujo, sin dropdown personalizado que necesite escapar del contenedor. `ProfessionalImageUpload` tampoco requiere overflow visible.
- También revisé los consumidores adicionales `BookingTools.js` (QR) y `ui/command.jsx` (wrapper sin usos de `CommandDialog` encontrados). Este último sobrescribe con `overflow-hidden` mediante `cn`/`twMerge`. No se identificó una dependencia estática de overflow visible rota por #18. Esto **no sustituye** QA de scroll, foco y selectores reales en navegador/375 px, que queda para la Tarea 3.

## Validación y límites

- `git diff --check`: sin errores.
- `py_compile`: 53 módulos principales de backend correctos.
- `python -m unittest discover -s backend/tests -p test_service_presentation.py -v`: 14 pruebas existentes pasan.
- Cuatro comprobaciones locales: R1/R2 con funciones extraídas por AST y dobles de DB/autorización, R3 con reloj fijo, R4 con inspección del formulario. Permiten reproducir la lógica sin importar el servidor ni iniciar trabajadores; no prueban transporte HTTP, índices o transacciones de MongoDB.
- Build frontend: `CI=true GENERATE_SOURCEMAP=false yarn build` compiló correctamente (160,63 s).
- No hubo pruebas contra producción, QA autenticada ni auditoría nueva de media/video. Un build y los tests existentes pasan a pesar de R1–R4: no cubren esas regresiones.
- `.planning/` preexistente permanece intacto y fuera del commit.

## Siguiente paso en GitHub

Revisar este PR documental y abrir un PR pequeño por hallazgo confirmado: priorizar R1/R2, después R3/R4. R5 requiere aclaración de contrato, no una corrección urgente. No mezclar esos fixes con la auditoría ni con fondos del portal. Tras las futuras fusiones, el usuario coordina Pull from GitHub, Preview y Redeploy en Emergent; esta tarea no despliega.
