# Inventario: ubicaciones y conteo físico con equipo (diseño)

Pedido del usuario (2026-10-05), resumido:

1. **Ubicaciones opcionales** por artículo (bodega, ubicación/sección, palet) para filtrar y saber cantidades por lugar. *(Etapa 1, PR #158)*
2. **Conteo físico** dentro de Inventario: el manager habilita a personas del equipo (otro manager de su organización o staff) **de forma temporal**; les asigna contar un producto o una sección; cuentan **uno por uno** (artículo, estado, cantidad, ubicación, precio de la etiqueta, código); pueden editar/eliminar/agregar y **guardar**. *(Etapa 2 backend, Etapa 3 interfaz)*
3. **Integridad:** si dos personas cuentan lo mismo **no se suman**; se **comparan**. Si difieren en cantidad, estado, código o precio → **alerta al manager**, que puede pedir **reconteo** de ese producto.
4. **Resolución:** diferencias contra el sistema se definen como **pérdida** o **excedente** (con comentario). El manager acepta (y el stock se actualiza) o rechaza y pide reconteo.
5. **Trazabilidad:** Kardex con entradas, salidas, daños, pérdidas y excedentes por artículo.
6. A futuro: lectura de QR / código de barras con el celular (el campo `code` ya queda en cada conteo).

## Modelo de datos (etapa 2)
- `inventory_counts`: sesión (`count_id`, `count_number` CNT-AAAA-nnnnnn, `status`: `counting` | `closed` | `cancelled`, `blind_count`, alcance, notas, creador).
- `inventory_count_targets`: lo esperado: (artículo, ubicación) con la existencia del sistema al crear la sesión (`system_quantity`), `round` (sube con cada reconteo), `resolution` (`loss` | `surplus` | `dismiss`), `comment`, `extra` (contado fuera de lo esperado).
- `inventory_count_assignments`: quién cuenta, qué (todo o un subconjunto), `expires_at` (acceso temporal; máx. 14 días), `revoked`, `submitted_at`.
- `inventory_count_entries`: lo que cada persona cuenta (`condition` bueno/dañado/vencido/otro, `quantity`, ubicación, `label_price`, `code`, `round`); borrado lógico.

## Reglas clave
- **Acceso temporal:** un contador solo ve y edita la sesión mientras su asignación no haya vencido ni se haya revocado y la sesión esté abierta. No necesita rol de gestión.
- **No se suman conteos de personas distintas:** por (artículo, ubicación) y ronda se comparan estado→cantidad, código y precio de etiqueta.
- **Cantidad contada** = bueno + dañado + vencido + otro. Diferencia contra el sistema = pérdida (negativa) o excedente (positiva). Lo dañado/vencido además sale del stock como **merma** (movimiento `waste`), de modo que el stock final = cantidad en buen estado.
- Mientras haya objetivos con **discrepancia entre contadores** o **diferencia sin resolver**, la sesión no se puede cerrar.
- Cerrar aplica ajustes con **idempotencia** (`count:{id}:{target}:{round}`), registra movimientos (`audit_adjustment_in/out` con `adjustment_reason` pérdida/excedente, y `waste`) y actualiza las existencias por ubicación.
- **Alertas** al manager (notificaciones de la organización): conteo enviado, discrepancia entre contadores, pérdida, excedente, diferencia de precio de etiqueta.

## Etapas
1. Ubicaciones opcionales (hecha).
2. Backend del conteo físico (este PR).
3. Interfaz: pestaña "Conteos" para el manager (crear, asignar, seguimiento, revisión, reconteo, cierre), página del contador (celular) y trazabilidad ampliada en el Kardex.
