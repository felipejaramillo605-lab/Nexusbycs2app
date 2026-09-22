"""Regression for the public catalog checkout abuse finding (Alto, Tarea 2)."""

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from product_catalog import CartItemInput, CatalogCheckoutRequest  # noqa: E402


class CartAbuseLimitsTests(unittest.TestCase):
    def test_quantity_over_20_is_rejected(self):
        with self.assertRaises(ValidationError):
            CartItemInput(product_id="p1", quantity=21)

    def test_quantity_of_20_is_still_allowed(self):
        CartItemInput(product_id="p1", quantity=20)  # should not raise

    def test_cart_over_30_lines_is_rejected(self):
        items = [{"product_id": f"p{i}", "quantity": 1} for i in range(31)]
        with self.assertRaises(ValidationError):
            CatalogCheckoutRequest(client_name="Cliente", client_phone="+573001112233", items=items)

    def test_empty_cart_is_rejected_by_the_model_itself(self):
        with self.assertRaises(ValidationError):
            CatalogCheckoutRequest(client_name="Cliente", client_phone="+573001112233", items=[])

    def test_reasonable_cart_is_accepted(self):
        items = [{"product_id": "p1", "quantity": 3}, {"product_id": "p2", "quantity": 5}]
        request = CatalogCheckoutRequest(client_name="Cliente", client_phone="+573001112233", items=items)
        self.assertEqual(len(request.items), 2)


if __name__ == "__main__":
    unittest.main()
