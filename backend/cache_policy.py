"""Politica de cache de las respuestas de la API.

Cloudflare guarda por URL (sin mirar la sesion) las respuestas con extension de archivo estatico (.xlsx, .pdf, .csv...)
cuando el origen no dice nada sobre el cache. Una nomina, una colilla o un reporte descargado por un manager podia
entregarse a cualquier otra persona que pidiera la misma URL durante el TTL del borde. Por eso toda respuesta de la API
que no declare su propia politica sale con ``no-store``; las imagenes publicas ya traen su Cache-Control y no cambian.
"""

from __future__ import annotations

NO_STORE = "no-store, private"


def apply_cache_policy(path: str, headers) -> None:
    """Agrega ``Cache-Control: no-store`` a las respuestas de /api que no declaran su propio Cache-Control."""
    if not path.startswith("/api"):
        return
    if "cache-control" in {key.lower() for key in headers.keys()}:
        return
    headers["Cache-Control"] = NO_STORE
    headers["Pragma"] = "no-cache"
