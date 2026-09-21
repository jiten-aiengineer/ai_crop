"""Import the private CLSL customer/dealer master into PostgreSQL.

The source file is deliberately mounted at runtime and excluded from Git.  The
import is idempotent by dealer code and does not touch referral, login, farmer,
or coupon relationships.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from .db import connection


REQUIRED_COLUMNS = {
    "Code",
    "Name",
    "Sales Executive",
    "Sales Area",
    "Sales Region",
    "Sales Territory",
    "State",
}


def clean(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def load_rows(csv_path: Path) -> tuple[dict[str, dict[str, str]], int]:
    rows_by_code: dict[str, dict[str, str]] = {}
    duplicate_rows = 0

    with csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Dealer import is missing columns: {', '.join(sorted(missing))}")

        for raw in reader:
            code = clean(raw.get("Code"))
            name = clean(raw.get("Name"))
            if not code or not name:
                continue
            if code in rows_by_code:
                duplicate_rows += 1
            status = clean(raw.get("Status")).lower()
            rows_by_code[code] = {
                "dealer_code": code,
                "name": name,
                "sales_executive": clean(raw.get("Sales Executive")),
                "sales_area": clean(raw.get("Sales Area")),
                "sales_region": clean(raw.get("Sales Region")),
                "sales_territory": clean(raw.get("Sales Territory")),
                "state": clean(raw.get("State")),
                "status": "inactive" if status in {"inactive", "blocked", "block"} else "active",
            }

    return rows_by_code, duplicate_rows


def import_dealers(csv_path: Path) -> None:
    if not csv_path.is_file():
        raise FileNotFoundError(f"Dealer import file not found: {csv_path}")

    rows_by_code, duplicate_rows = load_rows(csv_path)
    rows = list(rows_by_code.values())
    if not rows:
        raise ValueError("Dealer import contains no valid dealer records.")

    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO dealers (
                    dealer_code, name, sales_executive, sales_area,
                    sales_region, sales_territory, state, status
                ) VALUES (
                    %(dealer_code)s, %(name)s, %(sales_executive)s, %(sales_area)s,
                    %(sales_region)s, %(sales_territory)s, %(state)s, %(status)s
                )
                ON CONFLICT (dealer_code) DO UPDATE SET
                    name = EXCLUDED.name,
                    sales_executive = EXCLUDED.sales_executive,
                    sales_area = EXCLUDED.sales_area,
                    sales_region = EXCLUDED.sales_region,
                    sales_territory = EXCLUDED.sales_territory,
                    state = EXCLUDED.state,
                    status = EXCLUDED.status,
                    updated_at = now()
                """,
                rows,
            )
        conn.commit()

    active = sum(row["status"] == "active" for row in rows)
    print(
        f"Dealer import complete: {len(rows)} unique records "
        f"({active} active, {len(rows) - active} inactive); "
        f"{duplicate_rows} duplicate source rows resolved."
    )


if __name__ == "__main__":
    source_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/imports/dealers_master.csv")
    import_dealers(source_path)
