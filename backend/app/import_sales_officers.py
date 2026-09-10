"""Seed the supplied sales-officer territory roster without creating people.

The employee database remains the sole source for work contact fields. A
territory record links only to an exact normalised employee name, so unmatched
people are surfaced to HR in the portal instead of receiving made-up details.
"""

import json
import re
import sys
from pathlib import Path

from .db import connection


def normalise(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def main(seed_path: str) -> None:
    rows = json.loads(Path(seed_path).read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Sales-officer seed must be a JSON array.")
    with connection() as conn:
        employees = conn.execute("SELECT id, full_name FROM employees").fetchall()
        by_name = {normalise(row["full_name"]): row["id"] for row in employees}
        matched = 0
        for row in rows:
            source_name = str(row["name"]).strip()
            employee_id = by_name.get(normalise(source_name))
            matched += int(employee_id is not None)
            conn.execute(
                """
                INSERT INTO sales_officer_territories(source_row, source_name, state, territory, employee_id, status)
                VALUES (%s, %s, %s, %s, %s, 'active')
                ON CONFLICT (state, territory) DO UPDATE SET
                    source_row = EXCLUDED.source_row,
                    source_name = EXCLUDED.source_name,
                    employee_id = EXCLUDED.employee_id,
                    status = 'active',
                    updated_at = now()
                """,
                (int(row["row"]), source_name, str(row["state"]).strip(), str(row["territory"]).strip(), employee_id),
            )
        conn.commit()
    print(f"Sales-officer roster seeded: {len(rows)} territories; {matched} matched to employee directory.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.import_sales_officers /path/to/sales_officers.json")
    main(sys.argv[1])
