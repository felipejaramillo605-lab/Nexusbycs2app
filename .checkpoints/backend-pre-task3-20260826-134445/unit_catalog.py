# NEXUS_UNIT_CATALOG_V1
"""
Catálogo central de unidades de medida para inventario y órdenes de compra.

Antes de este módulo, `unit` era texto libre sin ninguna restricción, y
`quantity` era un float sin restricción en todo el flujo (referencia de
inventario, movimientos, y líneas de orden de compra). Eso permitía cosas
como "1,3 unidades" o "2.5 cajas", que no tienen sentido físico.

Este catálogo es intencionalmente pequeño y curado (no exhaustivo) — se puede
extender agregando entradas al diccionario. Cada unidad indica si es
"discreta" (se cuenta en enteros: unidades, cajas, pares, paquetes) o
"continua" (admite fracciones: litros, kilogramos, gramos, mililitros,
onzas, metros).
"""

UNIT_CATALOG = {
    "unidades":    {"label": "Unidades",    "discrete": True},
    "pares":       {"label": "Pares",       "discrete": True},
    "cajas":       {"label": "Cajas",       "discrete": True},
    "paquetes":    {"label": "Paquetes",    "discrete": True},
    "frascos":     {"label": "Frascos",     "discrete": True},
    "litros":      {"label": "Litros",      "discrete": False},
    "mililitros":  {"label": "Mililitros",  "discrete": False},
    "kilogramos":  {"label": "Kilogramos",  "discrete": False},
    "gramos":      {"label": "Gramos",      "discrete": False},
    "onzas":       {"label": "Onzas",       "discrete": False},
    "metros":      {"label": "Metros",      "discrete": False},
}

DEFAULT_UNIT = "unidades"


def is_known_unit(unit: str) -> bool:
    return (unit or "").strip().lower() in UNIT_CATALOG


def is_discrete_unit(unit: str) -> bool:
    """
    True si la unidad debe manejarse en números enteros.
    Unidades desconocidas (texto libre legado, datos previos a este catálogo)
    se tratan como NO discretas por seguridad, para no romper datos
    existentes con decimales legítimos que ya estaban guardados.
    """
    entry = UNIT_CATALOG.get((unit or "").strip().lower())
    return bool(entry and entry["discrete"])


def validate_quantity_for_unit(quantity: float, unit: str, field_label: str = "Cantidad") -> None:
    """
    Lanza ValueError si `quantity` no es un entero y `unit` es una unidad discreta.
    Se usa tanto en inventario (quantity, min_stock) como en líneas de orden
    de compra (quantity), para no duplicar la regla en cada módulo.
    """
    if is_discrete_unit(unit) and float(quantity) != int(quantity):
        raise ValueError(
            f"{field_label} debe ser un número entero para la unidad '{unit}'. "
            f"Recibido: {quantity}"
        )
