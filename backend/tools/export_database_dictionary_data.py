import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def rows(conn, sql, params=()):
    return [dict(item) for item in conn.execute(sql, params).fetchall()]


def scalar(conn, sql, params=()):
    result = conn.execute(sql, params).fetchone()
    return next(iter(result.values()))


def main(output_path: str) -> None:
    database_url = os.environ["DATABASE_URL"]
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        tables = [
            item["table_name"]
            for item in rows(
                conn,
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
            )
        ]
        counts = {}
        for table in tables:
            counts[table] = scalar(conn, f'SELECT count(*) FROM "{table}"')

        columns = rows(
            conn,
            """
            SELECT table_name, ordinal_position, column_name, data_type, udt_name,
                   is_nullable, column_default, character_maximum_length,
                   numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
            """,
        )
        constraints = rows(
            conn,
            """
            SELECT c.relname AS table_name, con.conname AS constraint_name,
                   CASE con.contype
                     WHEN 'p' THEN 'PRIMARY KEY'
                     WHEN 'f' THEN 'FOREIGN KEY'
                     WHEN 'u' THEN 'UNIQUE'
                     WHEN 'c' THEN 'CHECK'
                     ELSE con.contype::text
                   END AS constraint_type,
                   pg_get_constraintdef(con.oid, true) AS definition
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            ORDER BY c.relname, constraint_type, con.conname
            """,
        )
        indexes = rows(
            conn,
            """
            SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname
            """,
        )

        audit = {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "database": {
                "name": scalar(conn, "SELECT current_database()"),
                "user": scalar(conn, "SELECT current_user"),
                "server_version": scalar(conn, "SHOW server_version"),
                "size_bytes": scalar(conn, "SELECT pg_database_size(current_database())"),
            },
            "tables": tables,
            "counts": counts,
            "columns": columns,
            "constraints": constraints,
            "indexes": indexes,
            "migrations": rows(conn, "SELECT version, checksum, applied_at FROM schema_migrations ORDER BY applied_at"),
            "employee_summary": rows(
                conn,
                """
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE status = 'active') AS active,
                       count(*) FILTER (WHERE status = 'pending') AS pending,
                       count(*) FILTER (WHERE status = 'inactive') AS inactive,
                       count(*) FILTER (WHERE office_email IS NOT NULL) AS with_office_email,
                       count(*) FILTER (WHERE personal_email IS NOT NULL) AS with_personal_email,
                       count(*) FILTER (WHERE office_email IS NULL AND personal_email IS NULL) AS without_any_email,
                       count(*) FILTER (WHERE reporting_manager_id IS NOT NULL) AS resolved_managers,
                       count(*) FILTER (WHERE reporting_manager_name IS NOT NULL AND reporting_manager_id IS NULL) AS unresolved_managers
                FROM employees
                """,
            )[0],
            "role_counts": rows(
                conn,
                """
                SELECT r.code, r.name, r.description, count(er.employee_id) AS assigned_employees
                FROM roles r
                LEFT JOIN employee_roles er ON er.role_code = r.code
                GROUP BY r.code, r.name, r.description
                ORDER BY r.code
                """,
            ),
            "admin": rows(
                conn,
                """
                SELECT e.employee_code, e.full_name, e.office_email, e.status,
                       string_agg(er.role_code, ', ' ORDER BY er.role_code) AS roles
                FROM employees e
                JOIN employee_roles er ON er.employee_id = e.id
                WHERE e.employee_code = 'CLSL-1415'
                GROUP BY e.id
                """,
            )[0],
            "category_counts": rows(
                conn,
                """
                SELECT pc.code, pc.name, count(p.id) AS product_count
                FROM product_categories pc
                LEFT JOIN products p ON p.category_id = pc.id
                GROUP BY pc.id
                ORDER BY pc.name
                """,
            ),
            "crop_counts": rows(
                conn,
                """
                SELECT c.name, c.aliases, c.status, count(m.product_id) AS mapped_products
                FROM crops c
                LEFT JOIN product_crop_mappings m ON m.crop_id = c.id
                GROUP BY c.id
                ORDER BY c.name
                """,
            ),
            "problem_counts": rows(
                conn,
                """
                SELECT p.issue_type, p.name, p.aliases, p.status,
                       count(m.product_id) AS mapped_products
                FROM problems p
                LEFT JOIN product_problem_mappings m ON m.problem_id = p.id
                GROUP BY p.id
                ORDER BY p.issue_type, p.name
                """,
            ),
            "problem_type_counts": rows(
                conn,
                """
                SELECT issue_type, count(*) AS problem_count
                FROM problems
                GROUP BY issue_type
                ORDER BY issue_type
                """,
            ),
            "products": rows(
                conn,
                """
                SELECT p.id, p.name, pc.name AS category, p.common_name, p.dose,
                       p.packing, p.source_page, p.status, p.approval_status,
                       count(DISTINCT cm.crop_id) AS crop_mappings,
                       count(DISTINCT pm.problem_id) AS problem_mappings,
                       concat_ws(', ',
                         CASE WHEN p.dose IS NULL THEN 'dose' END,
                         CASE WHEN p.use_benefits IS NULL THEN 'uses/benefits' END,
                         CASE WHEN p.packing IS NULL THEN 'packing' END,
                         CASE WHEN p.image_path IS NULL THEN 'image' END
                       ) AS source_gaps
                FROM products p
                JOIN product_categories pc ON pc.id = p.category_id
                LEFT JOIN product_crop_mappings cm ON cm.product_id = p.id
                LEFT JOIN product_problem_mappings pm ON pm.product_id = p.id
                GROUP BY p.id, pc.name
                ORDER BY pc.name, p.name
                """,
            ),
            "settings": rows(
                conn,
                """
                SELECT s.key, s.value, e.employee_code AS updated_by, s.updated_at
                FROM app_settings s
                LEFT JOIN employees e ON e.id = s.updated_by
                ORDER BY s.key
                """,
            ),
            "integrity": {
                "duplicate_employee_codes": scalar(conn, "SELECT count(*) FROM (SELECT employee_code FROM employees GROUP BY employee_code HAVING count(*) > 1) x"),
                "duplicate_office_emails": scalar(conn, "SELECT count(*) FROM (SELECT office_email FROM employees WHERE office_email IS NOT NULL GROUP BY office_email HAVING count(*) > 1) x"),
                "invalid_office_domains": scalar(conn, "SELECT count(*) FROM employees WHERE office_email IS NOT NULL AND office_email NOT LIKE '%%@croplifescience.com'"),
                "employees_without_field_role": scalar(conn, "SELECT count(*) FROM employees e WHERE NOT EXISTS (SELECT 1 FROM employee_roles er WHERE er.employee_id=e.id AND er.role_code='field_employee')"),
                "elevated_roles_outside_admin": scalar(conn, "SELECT count(*) FROM employee_roles er JOIN employees e ON e.id=er.employee_id WHERE er.role_code <> 'field_employee' AND e.employee_code <> 'CLSL-1415'"),
                "approved_products_without_admin": scalar(conn, "SELECT count(*) FROM products p LEFT JOIN employees e ON e.id=p.approved_by WHERE p.approval_status='approved' AND e.employee_code IS DISTINCT FROM 'CLSL-1415'"),
                "approved_crop_mappings_without_admin": scalar(conn, "SELECT count(*) FROM product_crop_mappings m LEFT JOIN employees e ON e.id=m.approved_by WHERE m.approval_status='approved' AND e.employee_code IS DISTINCT FROM 'CLSL-1415'"),
                "approved_problem_mappings_without_admin": scalar(conn, "SELECT count(*) FROM product_problem_mappings m LEFT JOIN employees e ON e.id=m.approved_by WHERE m.approval_status='approved' AND e.employee_code IS DISTINCT FROM 'CLSL-1415'"),
            },
        }

    Path(output_path).write_text(json.dumps(audit, indent=2, default=str), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python export_database_dictionary_data.py OUTPUT.json")
    main(sys.argv[1])
