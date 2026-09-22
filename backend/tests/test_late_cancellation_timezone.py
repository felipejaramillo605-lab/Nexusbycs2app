"""Regression for R3: late-cancellation check must use the org's local timezone, not UTC."""

import ast
import datetime as real_datetime
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo


class FrozenDateTime(real_datetime.datetime):
    """A datetime subclass whose .now() returns a fixed instant for the test."""

    _frozen_utc = None

    @classmethod
    def now(cls, tz=None):
        frozen = cls._frozen_utc
        return frozen.astimezone(tz) if tz else frozen.replace(tzinfo=None)


class LateCancellationTimezoneTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).resolve().parents[1] / "server.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_is_late_cancellation")
        scope = {
            "Optional": __import__("typing").Optional,
            "datetime": FrozenDateTime,
            "timezone": real_datetime.timezone,
            "timedelta": real_datetime.timedelta,
            "ZoneInfo": ZoneInfo,
        }
        exec(compile(ast.Module(body=[function], type_ignores=[]), "server.py", "exec"), scope)
        self.is_late = scope["_is_late_cancellation"]
        self.bogota = ZoneInfo("America/Bogota")

    def test_2h_cutoff_bogota_class_not_late_five_hours_before_utc_midpoint(self):
        # Class 2026-09-22 18:00 Bogota (UTC-5) with a 2h cutoff means the
        # cutoff is 16:00 Bogota = 21:00 UTC. "Now" here is 18:00 UTC, i.e.
        # 13:00 Bogota -- 3 hours before the cutoff, so this must NOT be late.
        # The pre-fix code interpreted 18:00 as UTC and compared against a
        # cutoff of 16:00 UTC, wrongly calling it late 5 hours early.
        FrozenDateTime._frozen_utc = real_datetime.datetime(2026, 9, 22, 18, 0, tzinfo=real_datetime.timezone.utc)
        session = {"date": "2026-09-22", "time": "18:00"}
        service = {"cancellation_cutoff_hours": 2}
        self.assertFalse(self.is_late(session, service, self.bogota))

    def test_2h_cutoff_bogota_class_is_late_after_local_cutoff(self):
        # Now = 21:30 UTC = 16:30 Bogota, 30 minutes past the 16:00 Bogota
        # cutoff for an 18:00 Bogota class -- this one really is late.
        FrozenDateTime._frozen_utc = real_datetime.datetime(2026, 9, 22, 21, 30, tzinfo=real_datetime.timezone.utc)
        session = {"date": "2026-09-22", "time": "18:00"}
        service = {"cancellation_cutoff_hours": 2}
        self.assertTrue(self.is_late(session, service, self.bogota))

    def test_no_cutoff_configured_is_never_late(self):
        FrozenDateTime._frozen_utc = real_datetime.datetime(2026, 9, 22, 23, 59, tzinfo=real_datetime.timezone.utc)
        session = {"date": "2026-09-22", "time": "00:00"}
        self.assertFalse(self.is_late(session, {}, self.bogota))
        self.assertFalse(self.is_late(session, None, self.bogota))


if __name__ == "__main__":
    unittest.main()
