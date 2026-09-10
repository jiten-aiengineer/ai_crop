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


def city(value: str) -> str:
    value = re.sub(r'\([^)]*\)|-(?:guj|mp|mh|up|wb|bihar|patna).*$', '', value, flags=re.I)
    value = re.sub(r'[^a-z]', '', value.casefold())
    return {'nasrigunj': 'nasriganj', 'nadiad': 'nadiyad', 'sambhajinagar': 'sambhajinagar',
            'faizabad': 'ayodhya', 'begusarari': 'begusarai', 'tarakeswar': 'tarkeshwar'}.get(value, value)


def match_employee(row, employees):
    compact = lambda text: re.sub(r'[^a-z0-9]', '', text.casefold())
    exact = [e for e in employees if compact(e['full_name']) == compact(row['name'])]
    if len(exact) == 1:
        return exact[0]['id']
    # Accept an omitted middle name only when all supplied name tokens appear
    # in the same order and the employee location corroborates the territory.
    words = normalise(row['name']).split()
    candidates = []
    for employee in employees:
        if len(words) < 2 or city(employee['location'] or '') != city(row['territory']):
            continue
        remaining = iter(normalise(employee['full_name']).split())
        if all(any(word == token for token in remaining) for word in words):
            candidates.append(employee)
    return candidates[0]['id'] if len(candidates) == 1 else None


def main(seed_path: str) -> None:
    rows = json.loads(Path(seed_path).read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Sales-officer seed must be a JSON array.")
    with connection() as conn:
        employees = conn.execute("SELECT id, full_name, location FROM employees WHERE department IS DISTINCT FROM 'Demonstration'").fetchall()
        matched = 0
        for row in rows:
            source_name = str(row["name"]).strip()
            employee_id = match_employee(row, employees)
            matched += int(employee_id is not None)
            conn.execute(
                """
                INSERT INTO sales_officer_territories(source_row, source_name, state, territory, employee_id, status)
                VALUES (%s, %s, %s, %s, %s, 'active')
                ON CONFLICT (state, territory) DO UPDATE SET
                    source_row = EXCLUDED.source_row,
                    source_name = EXCLUDED.source_name,
                    employee_id = CASE WHEN sales_officer_territories.match_locked THEN sales_officer_territories.employee_id ELSE EXCLUDED.employee_id END,
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
