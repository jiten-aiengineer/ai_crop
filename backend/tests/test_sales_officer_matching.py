import csv
import json
import sys
import types
import unittest
from pathlib import Path


# Matching is a pure function. Avoid requiring a live PostgreSQL driver for
# this contract test; production imports the real connection module.
fake_db = types.ModuleType("backend.app.db")
fake_db.connection = None
sys.modules.setdefault("backend.app.db", fake_db)

from backend.app.import_sales_officers import match_employee  # noqa: E402


ROOT = Path(__file__).resolve().parents[2]


class SalesOfficerMatchingTests(unittest.TestCase):
    def test_roster_links_to_existing_hr_records_without_copying_people(self):
        with (ROOT / "backend" / "private-import" / "employees.csv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            employees = list(csv.DictReader(handle))
        for employee in employees:
            employee["id"] = employee["employee_code"]
        roster = json.loads(
            (ROOT / "backend" / "app" / "data" / "sales_officers.json").read_text(encoding="utf-8")
        )

        matched = [match_employee(row, employees) for row in roster]

        self.assertEqual(67, len(roster))
        self.assertEqual(67, sum(employee_id is not None for employee_id in matched))
        self.assertEqual(67, len(set(matched)))


if __name__ == "__main__":
    unittest.main()
