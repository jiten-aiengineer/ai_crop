"""Synchronise confirmed Sales Officers without creating employee records.

The employee database remains the sole source for work contact fields. A
Roster spellings are discovery hints only. The visible identity and contact
fields always come from the HR employee record linked by employee ID.
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


def is_field_sales_officer(employee) -> bool:
    department = normalise(employee['department'] or '')
    designation = normalise(employee['designation'] or '')
    if 'sales' not in department:
        return False
    return bool(re.search(r'(^|\s)(sales officer|sales executive|sales trainee|officer|executive)(\s|$)', designation))


def territory_label(value: str) -> str:
    text = re.sub(r'\([^)]*\)', '', value or '').strip()
    text = re.sub(r'-(?:guj|m\.?p\.?|m\.?h\.?|u\.?p\.?|w\.?b\.?|bihar|patna|c\.?g\.?).*$', '', text, flags=re.I).strip()
    return text or (value or '').strip() or 'Territory pending HR'


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
        employees = conn.execute("""SELECT id, employee_code, full_name, location, department, designation,
            payroll_group, source_row, status, hr_sync_state FROM employees WHERE status <> 'inactive'""").fetchall()
        by_id = {employee['id']: employee for employee in employees}
        matched = 0
        for row in rows:
            employee_id = match_employee(row, employees)
            matched += int(employee_id is not None)
            official_name = by_id[employee_id]['full_name'] if employee_id else str(row["name"]).strip()
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
                (int(row["row"]), official_name, str(row["state"]).strip(), str(row["territory"]).strip(), employee_id),
            )
        # Future HR files can add clearly designated field-sales staff without
        # inventing a second employee. Payroll group supplies the state and the
        # HR location supplies the territory.
        linked_ids = {row['employee_id'] for row in conn.execute("SELECT employee_id FROM sales_officer_territories WHERE employee_id IS NOT NULL").fetchall()}
        roster_rows = conn.execute("SELECT id, employee_id, territory FROM sales_officer_territories").fetchall()
        added = 0
        for employee in employees:
            if employee['id'] in linked_ids or employee['hr_sync_state'] != 'new' or not is_field_sales_officer(employee):
                continue
            location_key = city(employee['location'] or '')
            same_territory = [roster for roster in roster_rows if city(roster['territory']) == location_key]
            if same_territory:
                # An occupied territory remains one confirmed assignment; HR can
                # replace it automatically only when the prior employee is no
                # longer present in the active employee snapshot.
                continue
            state = (employee['payroll_group'] or 'State pending HR').strip()
            territory = territory_label(employee['location'] or '')
            conn.execute("""
                INSERT INTO sales_officer_territories(source_row, source_name, state, territory, employee_id, status, match_locked)
                VALUES (%s, %s, %s, %s, %s, 'active', true)
                ON CONFLICT (state, territory) DO NOTHING
            """, (int(employee['source_row'] or 100000 + added), employee['full_name'], state, territory, employee['id']))
            linked_ids.add(employee['id']); added += 1
        conn.commit()
    print(f"Sales-officer roster synchronised: {len(rows)} confirmed territories; {matched} matched; {added} new HR-designated field officers added.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.import_sales_officers /path/to/sales_officers.json")
    main(sys.argv[1])
