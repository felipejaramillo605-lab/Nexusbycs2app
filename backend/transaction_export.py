"""Pure CSV-building helper for the transactions export report."""

import csv
import io

PAYMENT_METHOD_LABELS = {
    "cash": "Efectivo",
    "card": "Tarjeta",
    "transfer": "Transferencia",
    "nequi": "Nequi",
    "daviplata": "Daviplata",
    "other": "Otro",
}

CSV_HEADER = [
    "Fecha", "Servicio", "Profesional", "Medio de pago", "Estado",
    "Precio original", "Descuento", "Valor neto", "Comision staff",
    "Participacion negocio", "Propina", "Total recibido",
]


def build_transactions_csv(items: list[dict]) -> str:
    """Render transaction documents as a UTF-8 CSV string with a BOM (for Excel)."""
    buffer = io.StringIO()
    buffer.write("﻿")
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADER)
    for item in items:
        writer.writerow([
            item.get("created_at", ""),
            item.get("service_name_snapshot", ""),
            item.get("barber_name_snapshot", ""),
            PAYMENT_METHOD_LABELS.get(item.get("payment_method"), item.get("payment_method", "")),
            "Anulada" if item.get("status") == "voided" else "Confirmada",
            item.get("service_price_snapshot", 0),
            item.get("discount_amount", 0),
            item.get("net_service_amount", 0),
            item.get("staff_commission_amount", 0),
            item.get("business_amount", 0),
            item.get("tip_amount", 0),
            item.get("total_received", 0),
        ])
    return buffer.getvalue()


def transactions_export_filename(start_date: str | None, end_date: str | None) -> str:
    return f"nexus-ingresos_{start_date or 'inicio'}_{end_date or 'hoy'}.csv"
