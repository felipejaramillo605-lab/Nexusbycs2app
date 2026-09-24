"""Unit tests for the pure CSV-building helper behind /transactions/export."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from transaction_export import build_transactions_csv, transactions_export_filename  # noqa: E402


class TransactionsCsvTests(unittest.TestCase):
    def test_header_row_and_bom(self):
        csv_text = build_transactions_csv([])
        self.assertTrue(csv_text.startswith("﻿"))
        header = csv_text.splitlines()[0].lstrip("﻿")
        self.assertEqual(
            header,
            "Fecha,Servicio,Profesional,Medio de pago,Estado,Precio original,"
            "Descuento,Valor neto,Comision staff,Participacion negocio,Propina,Total recibido",
        )

    def test_row_maps_payment_method_label_and_status(self):
        items = [{
            "created_at": "2026-09-24T10:00:00",
            "service_name_snapshot": "Corte Clásico",
            "barber_name_snapshot": "Juan",
            "payment_method": "nequi",
            "status": "confirmed",
            "service_price_snapshot": 25000,
            "discount_amount": 0,
            "net_service_amount": 25000,
            "staff_commission_amount": 15000,
            "business_amount": 10000,
            "tip_amount": 2000,
            "total_received": 27000,
        }]
        csv_text = build_transactions_csv(items)
        rows = csv_text.splitlines()
        self.assertEqual(len(rows), 2)
        self.assertIn("Nequi", rows[1])
        self.assertIn("Confirmada", rows[1])
        self.assertIn("Corte Clásico", rows[1])

    def test_voided_status_label(self):
        items = [{"payment_method": "cash", "status": "voided"}]
        csv_text = build_transactions_csv(items)
        self.assertIn("Anulada", csv_text.splitlines()[1])
        self.assertIn("Efectivo", csv_text.splitlines()[1])

    def test_unknown_payment_method_falls_back_to_raw_value(self):
        items = [{"payment_method": "crypto", "status": "confirmed"}]
        csv_text = build_transactions_csv(items)
        self.assertIn("crypto", csv_text.splitlines()[1])

    def test_missing_fields_default_to_empty_or_zero(self):
        csv_text = build_transactions_csv([{}])
        row = csv_text.splitlines()[1]
        self.assertEqual(row, ",,,,Confirmada,0,0,0,0,0,0,0")

    def test_filename_uses_date_range(self):
        self.assertEqual(
            transactions_export_filename("2026-09-01", "2026-09-24"),
            "nexus-ingresos_2026-09-01_2026-09-24.csv",
        )

    def test_filename_falls_back_when_dates_missing(self):
        self.assertEqual(transactions_export_filename(None, None), "nexus-ingresos_inicio_hoy.csv")


if __name__ == "__main__":
    unittest.main()
