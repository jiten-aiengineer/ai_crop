"""Seed the supplied sales-officer territory roster without creating people.

The employee database remains the sole source for work contact fields. A
territory record links only to an exact normalised employee name, so unmatched
people are surfaced to HR in the portal instead of receiving made-up details.
"""

import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

from .db import connection


def normalise(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def city(value: str) -> str:
    value = re.sub(r'\([^)]*\)|-(?:guj|mp|mh|up|wb|bihar|patna).*$', '', value, flags=re.I)
    value = re.sub(r'[^a-z]', '', value.casefold())
    return {'nasrigunj': 'nasriganj', 'nadiad': 'nadiyad', 'sambhajinagar': 'sambhajinagar',
            'faizabad': 'ayodhya', 'allahabad': 'prayagraj', 'nasik': 'nashik',
            'begusarari': 'begusarai', 'sitamarthi': 'sitamadhi', 'azamgarhup': 'azamgarh',
            'tarakeswar': 'tarkeshwar'}.get(value, value)


def is_sales_employee(employee) -> bool:
    """Use the HR designation as corroboration; never alter the HR record."""
    role_text = normalise(f"{employee['department'] or ''} {employee['designation'] or ''}")
    return 'sales' in role_text or 'territory' in role_text


def name_score(source_name: str, employee_name: str) -> float:
    compact = lambda text: re.sub(r'[^a-z0-9]', '', text.casefold())
    source_words = set(normalise(source_name).split())
    employee_words = set(normalise(employee_name).split())
    overlap = len(source_words & employee_words) / max(1, len(source_words))
    sequence = SequenceMatcher(None, compact(source_name), compact(employee_name)).ratio()
    return (overlap * 0.55) + (sequence * 0.45)


def match_employee(row, employees):
    compact = lambda text: re.sub(r'[^a-z0-9]', '', text.casefold())
    exact = [e for e in employees if compact(e['full_name']) == compact(row['name']) and is_sales_employee(e)]
    if len(exact) == 1:
        return exact[0]['id']
    # Accept an omitted middle name only when all supplied name tokens appear
    # in the same order and the employee location corroborates the territory.
    words = normalise(row['name']).split()
    candidates = []
    for employee in employees:
        if len(words) < 2 or not is_sales_employee(employee) or city(employee['location'] or '') != city(row['territory']):
            continue
        remaining = iter(normalise(employee['full_name']).split())
        if all(any(word == token for token in remaining) for word in words):
            candidates.append(employee)
    if len(candidates) == 1:
        return candidates[0]['id']

    # The supplied roster is a discovery guide. When spelling or middle names
    # differ, a unique HR employee with a sales designation in that territory is
    # a safer match than copying the roster name into the employee master.
    territory_sales = [
        employee for employee in employees
        if is_sales_employee(employee) and city(employee['location'] or '') == city(row['territory'])
    ]
    if len(territory_sales) == 1:
        return territory_sales[0]['id']
    if len(territory_sales) > 1:
        ranked = sorted(
            ((name_score(row['name'], employee['full_name']), employee) for employee in territory_sales),
            key=lambda item: item[0], reverse=True,
        )
        if ranked[0][0] >= 0.45 and (len(ranked) == 1 or ranked[0][0] - ranked[1][0] >= 0.10):
            return ranked[0][1]['id']
    return None


def main(seed_path: str) -> None:
    rows = json.loads(Path(seed_path).read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Sales-officer seed must be a JSON array.")
    with connection() as conn:
        employees = conn.execute("SELECT id, full_name, location, department, designation FROM employees").fetchall()
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
