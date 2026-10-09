# FASE 8 — Rendimiento con volumen (Preview)

**Rama:** `emergent/fase8-rendimiento`. **Siembra:** 10.000 clientes + 49.938 citas + 40.000 transacciones + 7.500 liquidaciones de staff, repartidos en 5 organizaciones `E2E_fase8_*` (barberos y servicios incluidos). Tiempo de siembra: **6.7 s** (bulk `insert_many`). **Todo fue borrado** al finalizar (verificado: 0 documentos remanentes).

Las mediciones se hicieron ejecutando exactamente el mismo patrón de consulta que usan los endpoints reales (`GET /clients`, `GET /appointments`, `GET /transactions/summary`, `commission_totals()` de `payroll.py`, la búsqueda de cliente por teléfono), vía Motor (driver async real), 25 repeticiones por caso con parámetros aleatorizados.

## Tabla de tiempos (p50 / p95)

| Consulta | p50 | p95 | Lectura |
|---|---|---|---|
| 1. Listado de clientes (paginado, 25/página) | 1.76 ms | 4.96 ms | OK |
| 1b. Listado de clientes **sin paginar** (hasta 1000) | **14.09 ms** | **27.36 ms** | 8x más lento que paginado |
| 2a. Agenda del día | 2.32 ms | 4.31 ms | OK |
| 2b. Agenda de la semana (7 días) | 4.48 ms | 9.54 ms | OK |
| 2c. Agenda de 30 / 90 / 365 días (sin paginar) | 9.68 / 21.5 / **79.31** ms | 15.1 / 23.86 / **91.76** ms | Escala linealmente con el rango — un reporte "del año" ya tarda ~40x más que uno de un día |
| 3. Reporte de ventas del mes (`/transactions/summary`) | **10.61 ms** | 13.66 ms | Agregación en Python tras traer todos los documentos del mes |
| 4. Nómina del mes — **implementación actual** (`commission_totals`, sin filtro en la consulta) | **15.36 ms** | **31.63 ms** | El más lento de los 5 pedidos explícitamente |
| 4b. Nómina del mes — **propuesta** (filtro de `status`+`period_end` en MongoDB) | 6.27 ms | 14.22 ms | **2.4x más rápido en p50, 2.2x en p95** |
| 5. Búsqueda de cliente por teléfono | 0.75 ms | 1.63 ms | OK — el índice `nexus_org_phone_client_lookup` (de FASE 5, ya en `main`) funciona |
| 5b. Búsqueda de cliente por nombre/correo (`$regex`, autocompletado) | 4.13 ms | 8.2 ms | OK hoy (2.000 clientes/org); ver hallazgo #5 sobre por qué no escalará igual |

## 5 cuellos de botella identificados (con evidencia)

### 1. [ALTA] `commission_totals()` en `payroll.py` — nómina del mes trae TODO el historial de liquidaciones
- **Evidencia:** `db.staff_settlements.find({"organization_id": org_id}, {"_id": 0}).to_list(20000)` — sin filtrar por `status` ni `period_end` en la consulta; el filtro de fecha/estado se aplica **en Python**, después de traer cada liquidación que la organización haya tenido jamás (hasta 20.000). Medido: 15.36 ms p50 / 31.63 ms p95 con solo 1.500 liquidaciones/org — el peor de los 5 tiempos pedidos.
- **Por qué empeora con el tiempo:** esta función se ejecuta en **cada creación de nómina** (`POST /payroll/runs`). A diferencia de las demás consultas (acotadas por fecha), esta escanea y transfiere el histórico completo del negocio sin límite temporal — con 3-5 años de operación, seguirá creciendo sin techo.
- **Propuesta (diff, NO aplicado a producción):**
  ```diff
  --- a/backend/payroll.py
  +++ b/backend/payroll.py
  @@ async def commission_totals(org_id, start: date, end: date) -> dict:
  -    rows = await db.staff_settlements.find({"organization_id": org_id}, {"_id": 0}).to_list(20000)
  -    out: dict = {}
  -    for row in rows:
  -        if row.get("status") not in ("approved", "paid"):
  -            continue
  -        end_day = str(row.get("period_end") or "")[:10]
  -        if not (start.isoformat() <= end_day <= end.isoformat()):
  -            continue
  -        bucket = out.setdefault(row["barber_id"], {"count": 0, "total": 0.0})
  -        bucket["count"] += 1
  -        bucket["total"] += float(row.get("total_amount") or 0)
  -    return out
  +    rows = await db.staff_settlements.find(
  +        {
  +            "organization_id": org_id,
  +            "status": {"$in": ["approved", "paid"]},
  +            "period_end": {"$gte": start.isoformat(), "$lte": end.isoformat()},
  +        },
  +        {"_id": 0, "barber_id": 1, "total_amount": 1},
  +    ).to_list(20000)
  +    out: dict = {}
  +    for row in rows:
  +        bucket = out.setdefault(row["barber_id"], {"count": 0, "total": 0.0})
  +        bucket["count"] += 1
  +        bucket["total"] += float(row.get("total_amount") or 0)
  +    return out
  ```
  Medido con esta forma de consulta: **6.27 ms p50 / 14.22 ms p95** (2.2-2.4x más rápido), y usa el índice ya existente `organization_id_1_status_1_created_at_-1` como prefijo — para un índice óptimo específico de `period_end` se podría agregar `{organization_id:1, status:1, period_end:1}` si el equipo lo aprueba en una futura FASE 5-bis.

### 2. [MEDIA] `/transactions/summary` — reporte de ventas agrega en Python, no en MongoDB
- **Evidencia:** trae hasta 100.000 documentos completos y suma/agrupa por método de pago y por día con un bucle de Python. Medido: 10.61 ms p50 con ~650 transacciones/mes por organización — ya es el 2do más lento de los 5, y escala linealmente con el volumen de transacciones del período solicitado (si no se pasa `start_date`/`end_date`, trae TODA la vida de la organización).
- **Propuesta (no aplicada):** reemplazar el `find()` + bucle por un pipeline `$group` de MongoDB (agrupar por `payment_method` y por día con `$dateToString`), devolviendo solo los totales agregados en vez de cada documento. Esto mueve el trabajo de Python a MongoDB y reduce drásticamente los bytes transferidos. No se escribió el diff completo del pipeline en este pase (cambio de mayor tamaño que el de payroll); se deja como recomendación para que el equipo lo implemente y lo pase por PR.

### 3. [MEDIA] `GET /clients` sin paginar es 8x más lento que paginado
- **Evidencia:** 14.09 ms p50 / 27.36 ms p95 (hasta 1000 documentos completos) vs. 1.76 ms / 4.96 ms paginado (25 documentos). El endpoint ya soporta paginación (`page`/`page_size`) — el riesgo es que alguna pantalla del frontend lo llame sin esos parámetros para organizaciones con muchos clientes.
- **Propuesta:** no se encontró ningún lugar del frontend que llame `/clients` sin paginar (fuera del alcance de este pase auditar cada pantalla); se recomienda como ítem de guardado de buenas prácticas: hacer `page`/`page_size` obligatorios en el endpoint (sin modo "trae todo"), o al menos bajar el límite de `to_list(1000)` a un tope más conservador.

### 4. [MEDIA] Agenda sin acotar a un rango corto escala linealmente y ya pesa en rangos largos
- **Evidencia:** 9.68 ms (30 días) → 21.5 ms (90 días) → **79.31 ms** (365 días), todas sin paginar (hasta 5.000 filas). Cualquier vista de "resumen anual" o reporte histórico de citas sin paginación seguirá degradándose a medida que la organización acumula años de citas.
- **Propuesta:** igual que en el hallazgo #3 — exigir paginación en reportes de rango amplio, o agregar un límite de rango de fechas razonable (ej. máximo 90 días por consulta sin paginar) en el propio endpoint.

### 5. [BAJA / LATENTE] Búsqueda de clientes por nombre/correo (`$regex`) no escala con la organización
- **Evidencia:** hoy es rápida (4.13 ms p50) porque cada organización de prueba solo tiene 2.000 clientes. El plan de ejecución (`explain()`) muestra que MongoDB solo puede usar el índice para acotar por `organization_id`; el filtro `$regex` sobre `name`/`phone`/`email` se aplica en memoria sobre **todos** los clientes de esa organización, sin ningún índice que lo acelere más allá del prefijo de organización.
- **Propuesta:** si el negocio más grande crece a decenas de miles de clientes, considerar un índice de texto (`text index`) de MongoDB o Atlas Search para el autocompletado de clientes por nombre. No se aplicó ningún cambio — queda como alerta temprana, no como bottleneck activo hoy.

## Resumen de severidad
ALTA: 1 (nómina — diff propuesto, no aplicado) · MEDIA: 3 (reporte de ventas, listado de clientes sin paginar, agenda sin acotar — recomendaciones, sin diffs aplicados) · BAJA/LATENTE: 1 (búsqueda por nombre).

**Ningún cambio de código se aplicó a `main` en esta fase** — todos los diffs son propuestas en este informe, pendientes de revisión de Felipe/Claude por PR, tal como se pidió explícitamente ("sin aplicar a producción").

## Confirmación de limpieza
Las 5 organizaciones `E2E_fase8_*` y sus 107.498 documentos sembrados (clientes, citas, transacciones, liquidaciones, barberos, servicios) fueron eliminados. Verificado: 0 documentos remanentes con ese prefijo en todas las colecciones usadas. `org_demo001` no fue tocada.

**FASE 8 completada — DETENIDO según instrucción del usuario.** No se inicia FASE 9.
