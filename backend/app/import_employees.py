import csv
import sys
import uuid
from collections import defaultdict
from datetime import date
from pathlib import Path

from .config import INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_EMPLOYEE_CODE
from .db import connection


ELEVATED_ROLES = (
    "super_admin",
    "manager",
    "product_approver",
    "mapping_approver",
    "expert_review_approver",
    "employee_access_approver",
)


def clean(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def parse_date(value: str | None) -> date | None:
    value = clean(value)
    return date.fromisoformat(value) if value else None


def main(path_value: str):
    source = Path(path_value)
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("Employee import file is empty.")

    import_batch_id = uuid.uuid4()
    seen_codes: set[str] = set()
    with connection() as conn:
        for row in rows:
            employee_code = clean(row.get("employee_code"))
            full_name = clean(row.get("full_name"))
            if not employee_code or not full_name:
                continue
            seen_codes.add(employee_code)

            office_email = clean(row.get("office_email"))
            if employee_code.upper() == INITIAL_ADMIN_EMPLOYEE_CODE.upper():
                office_email = INITIAL_ADMIN_EMAIL
            office_email = office_email.lower() if office_email else None
            reporting_manager_name = clean(row.get("reporting_manager_name"))
            # Treat a source row that names the employee as their own manager as
            # no manager, rather than preserving an invalid self-reference.
            if reporting_manager_name and reporting_manager_name.casefold() == full_name.casefold():
                reporting_manager_name = None
            status = "active" if office_email else "pending"
            existing = conn.execute(
                "SELECT id FROM employees WHERE employee_code = %s", (employee_code,)
            ).fetchone()
            employee_id = existing["id"] if existing else uuid.uuid4()
            conn.execute(
                """
                INSERT INTO employees(
                    id, employee_code, full_name, gender, date_of_birth, date_joined,
                    reporting_manager_name, location, department, designation,
                    payroll_group, office_mobile, office_email, personal_mobile,
                    personal_email, microsoft_upn, status, source_row,
                    hr_sync_state, hr_first_seen_at, hr_last_seen_at, hr_last_changed_at, hr_import_batch_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s,
                        'new', now(), now(), now(), %s)
                ON CONFLICT (employee_code) DO UPDATE SET
                    hr_sync_state = CASE WHEN
                        employees.full_name IS DISTINCT FROM EXCLUDED.full_name OR
                        employees.reporting_manager_name IS DISTINCT FROM EXCLUDED.reporting_manager_name OR
                        employees.location IS DISTINCT FROM EXCLUDED.location OR
                        employees.department IS DISTINCT FROM EXCLUDED.department OR
                        employees.designation IS DISTINCT FROM EXCLUDED.designation OR
                        employees.office_mobile IS DISTINCT FROM EXCLUDED.office_mobile OR
                        employees.office_email IS DISTINCT FROM EXCLUDED.office_email OR
                        employees.personal_mobile IS DISTINCT FROM EXCLUDED.personal_mobile OR
                        employees.personal_email IS DISTINCT FROM EXCLUDED.personal_email OR
                        employees.status IS DISTINCT FROM EXCLUDED.status
                    THEN 'updated' ELSE 'existing' END,
                    hr_last_changed_at = CASE WHEN
                        employees.full_name IS DISTINCT FROM EXCLUDED.full_name OR
                        employees.reporting_manager_name IS DISTINCT FROM EXCLUDED.reporting_manager_name OR
                        employees.location IS DISTINCT FROM EXCLUDED.location OR
                        employees.department IS DISTINCT FROM EXCLUDED.department OR
                        employees.designation IS DISTINCT FROM EXCLUDED.designation OR
                        employees.office_mobile IS DISTINCT FROM EXCLUDED.office_mobile OR
                        employees.office_email IS DISTINCT FROM EXCLUDED.office_email OR
                        employees.personal_mobile IS DISTINCT FROM EXCLUDED.personal_mobile OR
                        employees.personal_email IS DISTINCT FROM EXCLUDED.personal_email OR
                        employees.status IS DISTINCT FROM EXCLUDED.status
                    THEN now() ELSE employees.hr_last_changed_at END,
                    full_name = EXCLUDED.full_name,
                    gender = EXCLUDED.gender,
                    date_of_birth = EXCLUDED.date_of_birth,
                    date_joined = EXCLUDED.date_joined,
                    reporting_manager_name = EXCLUDED.reporting_manager_name,
                    location = EXCLUDED.location,
                    department = EXCLUDED.department,
                    designation = EXCLUDED.designation,
                    payroll_group = EXCLUDED.payroll_group,
                    office_mobile = EXCLUDED.office_mobile,
                    office_email = EXCLUDED.office_email,
                    personal_mobile = EXCLUDED.personal_mobile,
                    personal_email = EXCLUDED.personal_email,
                    microsoft_upn = EXCLUDED.microsoft_upn,
                    status = EXCLUDED.status,
                    source_row = EXCLUDED.source_row,
                    hr_last_seen_at = now(),
                    hr_import_batch_id = EXCLUDED.hr_import_batch_id,
                    updated_at = now()
                """,
                (
                    employee_id,
                    employee_code,
                    full_name,
                    clean(row.get("gender")),
                    parse_date(row.get("date_of_birth")),
                    parse_date(row.get("date_joined")),
                    reporting_manager_name,
                    clean(row.get("location")),
                    clean(row.get("department")),
                    clean(row.get("designation")),
                    clean(row.get("payroll_group")),
                    clean(row.get("office_mobile")),
                    office_email,
                    clean(row.get("personal_mobile")),
                    (clean(row.get("personal_email")) or "").lower() or None,
                    office_email,
                    status,
                    int(row["source_row"]) if clean(row.get("source_row")) else None,
                    import_batch_id,
                ),
            )

        # The HR file is a full employee snapshot. Missing previously imported
        # employees remain in history but are marked inactive instead of deleted.
        conn.execute(
            """UPDATE employees SET status='inactive', hr_sync_state='inactive',
               hr_last_changed_at=CASE WHEN status <> 'inactive' THEN now() ELSE hr_last_changed_at END,
               updated_at=now()
               WHERE source_row IS NOT NULL AND employee_code <> ALL(%s) AND employee_code <> %s""",
            (list(seen_codes), INITIAL_ADMIN_EMPLOYEE_CODE),
        )

        employees = conn.execute(
            "SELECT id, employee_code, full_name, reporting_manager_name FROM employees"
        ).fetchall()
        conn.execute("UPDATE employees SET reporting_manager_id = NULL")
        by_name: dict[str, list[uuid.UUID]] = defaultdict(list)
        for employee in employees:
            by_name[employee["full_name"].strip().casefold()].append(employee["id"])
        resolved = 0
        for employee in employees:
            manager_name = clean(employee["reporting_manager_name"])
            matches = by_name.get(manager_name.casefold(), []) if manager_name else []
            manager_id = matches[0] if len(matches) == 1 else None
            if manager_id and manager_id != employee["id"]:
                conn.execute(
                    "UPDATE employees SET reporting_manager_id = %s WHERE id = %s",
                    (manager_id, employee["id"]),
                )
                resolved += 1

        admin = conn.execute(
            "SELECT id FROM employees WHERE employee_code = %s",
            (INITIAL_ADMIN_EMPLOYEE_CODE,),
        ).fetchone()
        if not admin:
            raise RuntimeError("Initial administrator was not present in the employee import.")

        # HR synchronisation never resets manually approved portal roles.
        conn.execute(
            """
            INSERT INTO employee_roles(employee_id, role_code, granted_by)
            SELECT id, 'field_employee', %s FROM employees WHERE status <> 'inactive'
            ON CONFLICT (employee_id, role_code) DO NOTHING
            """,
            (admin["id"],),
        )
        for role_code in ELEVATED_ROLES:
            conn.execute(
                """
                INSERT INTO employee_roles(employee_id, role_code, granted_by)
                VALUES (%s, %s, %s)
                ON CONFLICT (employee_id, role_code) DO NOTHING
                """,
                (admin["id"], role_code, admin["id"]),
            )
        conn.execute(
            """
            UPDATE products
            SET approved_by = %s,
                approved_at = COALESCE(approved_at, now()),
                updated_at = now()
            WHERE approval_status = 'approved' AND approved_by IS NULL
            """,
            (admin["id"],),
        )
        conn.execute(
            """
            UPDATE app_settings
            SET updated_by = %s, updated_at = now()
            WHERE key = 'inspection_image_retention'
            """,
            (admin["id"],),
        )
        conn.commit()

        totals = conn.execute(
            """
            SELECT count(*) AS employees,
                   count(*) FILTER (WHERE office_email IS NOT NULL) AS with_office_email,
                   count(*) FILTER (WHERE status = 'pending') AS pending
            FROM employees
            """
        ).fetchone()
    print(
        f"Imported {totals['employees']} employees; "
        f"{totals['with_office_email']} have Microsoft login emails; "
        f"{totals['pending']} are pending an office email; "
        f"resolved {resolved} reporting-manager relationships."
    )
    # Re-evaluate the confirmed roster after HR changes. The sales synchroniser
    # links by employee ID and never writes employee names or contact fields.
    from .import_sales_officers import main as sync_sales_officers
    sync_sales_officers(str(Path(__file__).resolve().parent / 'data' / 'sales_officers.json'))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.import_employees /imports/employees.csv")
    main(sys.argv[1])
