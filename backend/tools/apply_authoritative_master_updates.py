"""Apply reviewed employee emails and the authoritative product-crop map.

The email CSV is a private, pre-reviewed list keyed by permanent employee code.
The product JSON is the public CLSL catalogue data generated from the approved
spreadsheet's final CIB column. The operation validates every key before it can
write and commits both masters in a single PostgreSQL transaction.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app.db import connection
from app.import_catalog_knowledge import approved_crop_aliases


ADMIN_EMPLOYEE_CODE = "CLSL-1415"
SOURCE_NOTE = "CLSL manager-approved CIB crop update"
EMAIL_PATTERN = re.compile(r"^[^@\s]+@croplifescience\.com$", re.IGNORECASE)


def load_email_updates(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    required = {"employee_code", "email", "source_row", "match_basis"}
    missing = required - set(rows[0] if rows else ())
    if missing:
        raise ValueError(f"Email update file is missing columns: {', '.join(sorted(missing))}")
    result = []
    seen_codes: set[str] = set()
    seen_emails: set[str] = set()
    for row in rows:
        code = str(row["employee_code"] or "").strip()
        email = str(row["email"] or "").strip().casefold()
        if not code or code in seen_codes:
            raise ValueError(f"Duplicate or blank employee code: {code or '<blank>'}")
        if not EMAIL_PATTERN.fullmatch(email) or email in seen_emails:
            raise ValueError(f"Invalid or duplicate corporate email: {email}")
        seen_codes.add(code)
        seen_emails.add(email)
        result.append({
            "employee_code": code,
            "email": email,
            "source_row": str(row["source_row"] or "").strip(),
            "match_basis": str(row["match_basis"] or "").strip(),
        })
    return result


def load_products(path: Path) -> list[dict]:
    products = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(products, list) or not products:
        raise ValueError("Product source must be a non-empty JSON array.")
    ids = [str(product.get("id") or "").strip() for product in products]
    if not all(ids) or len(ids) != len(set(ids)):
        raise ValueError("Product source contains a blank or duplicate product ID.")
    return products


def normalized_crops(product: dict) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in product.get("approvedCrops") or []:
        crop = " ".join(str(value or "").strip().rstrip(".").split())
        key = crop.casefold()
        if crop and key not in seen:
            seen.add(key)
            result.append(crop)
    return result


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email-updates", type=Path, required=True)
    parser.add_argument("--products", type=Path, required=True)
    parser.add_argument("--email-source-sha256", default="")
    parser.add_argument("--product-source-sha256", default="")
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()

    email_updates = load_email_updates(args.email_updates)
    products = load_products(args.products)
    proposed_map = {str(product["id"]): normalized_crops(product) for product in products}
    link_count = sum(len(crops) for crops in proposed_map.values())

    with connection() as conn:
        admin = conn.execute(
            "SELECT id FROM employees WHERE employee_code=%s", (ADMIN_EMPLOYEE_CODE,)
        ).fetchone()
        if not admin:
            raise RuntimeError(f"Administrator employee {ADMIN_EMPLOYEE_CODE} is missing.")

        employees = {
            row["employee_code"]: row
            for row in conn.execute(
                "SELECT id,employee_code,full_name,office_email,microsoft_upn FROM employees"
            ).fetchall()
        }
        missing_employees = sorted({row["employee_code"] for row in email_updates} - set(employees))
        if missing_employees:
            raise RuntimeError(f"Employee codes not found: {', '.join(missing_employees)}")

        email_owners = {
            row["office_email"].casefold(): row["employee_code"]
            for row in employees.values() if row["office_email"]
        }
        for update in email_updates:
            owner = email_owners.get(update["email"])
            if owner and owner != update["employee_code"]:
                raise RuntimeError(f"{update['email']} already belongs to {owner}.")

        database_product_ids = {
            row["id"] for row in conn.execute("SELECT id FROM products").fetchall()
        }
        source_product_ids = set(proposed_map)
        if database_product_ids != source_product_ids:
            missing = sorted(database_product_ids - source_product_ids)
            extra = sorted(source_product_ids - database_product_ids)
            raise RuntimeError(f"Product ID mismatch. Missing from source={missing}; extra in source={extra}")

        old_mappings: dict[str, list[str]] = {product_id: [] for product_id in database_product_ids}
        for row in conn.execute(
            """
            SELECT pcm.product_id,c.name
            FROM product_crop_mappings pcm JOIN crops c ON c.id=pcm.crop_id
            WHERE pcm.approval_status='approved' ORDER BY pcm.product_id,c.name
            """
        ).fetchall():
            old_mappings[row["product_id"]].append(row["name"])

        changed_emails = [
            update for update in email_updates
            if (employees[update["employee_code"]]["office_email"] or "").casefold() != update["email"]
        ]
        changed_products = [
            product_id for product_id, crops in proposed_map.items()
            if {crop.casefold() for crop in old_mappings[product_id]} != {crop.casefold() for crop in crops}
        ]
        summary = {
            "mode": "commit" if args.commit else "dry-run",
            "reviewed_email_rows": len(email_updates),
            "employee_email_changes": len(changed_emails),
            "products": len(products),
            "approved_product_crop_links": link_count,
            "products_without_approved_crops": sorted(
                product_id for product_id, crops in proposed_map.items() if not crops
            ),
            "products_with_changed_crop_maps": len(changed_products),
        }
        print(json.dumps(summary, indent=2))
        if not args.commit:
            conn.rollback()
            return

        for update in changed_emails:
            employee = employees[update["employee_code"]]
            previous_email = employee["office_email"]
            conn.execute(
                """
                UPDATE employees SET office_email=%s,
                    microsoft_upn=CASE WHEN microsoft_upn IS NULL OR lower(microsoft_upn)=lower(%s)
                                       THEN %s ELSE microsoft_upn END,
                    updated_at=now()
                WHERE id=%s
                """,
                (update["email"], previous_email, update["email"], employee["id"]),
            )
            conn.execute(
                "UPDATE portal_password_accounts SET email=%s WHERE employee_id=%s",
                (update["email"], employee["id"]),
            )
            conn.execute(
                """
                INSERT INTO audit_logs(id,actor_employee_id,action,entity_type,entity_key,previous_data,new_data)
                VALUES (%s,%s,'update_employee_office_email','employee',%s,%s::jsonb,%s::jsonb)
                """,
                (
                    uuid.uuid4(), admin["id"], update["employee_code"],
                    json.dumps({"office_email": previous_email}),
                    json.dumps({"office_email": update["email"], "source_row": update["source_row"], "match_basis": update["match_basis"]}),
                ),
            )

        conn.execute("DELETE FROM product_crop_mappings")
        crop_ids: dict[str, uuid.UUID] = {}
        canonical_labels: dict[str, str] = {}
        for crop_list in proposed_map.values():
            for crop in crop_list:
                canonical_labels.setdefault(crop.casefold(), crop)
        for key, crop in canonical_labels.items():
            existing = conn.execute(
                "SELECT id,name FROM crops WHERE lower(name)=lower(%s) ORDER BY (name=%s) DESC LIMIT 1",
                (crop, crop),
            ).fetchone()
            crop_id = existing["id"] if existing else uuid.uuid5(uuid.NAMESPACE_URL, f"clsl-crop:{key}")
            canonical_name = existing["name"] if existing else crop
            conn.execute(
                """
                INSERT INTO crops(id,name,aliases,status) VALUES (%s,%s,%s::jsonb,'active')
                ON CONFLICT (id) DO UPDATE SET aliases=EXCLUDED.aliases,status='active',updated_at=now()
                """,
                (crop_id, canonical_name, json.dumps(list(approved_crop_aliases(canonical_name)))),
            )
            crop_ids[key] = crop_id

        for product_id, crop_list in proposed_map.items():
            for crop in crop_list:
                conn.execute(
                    """
                    INSERT INTO product_crop_mappings(
                        product_id,crop_id,approval_status,submitted_by,approved_by,approved_at,notes
                    ) VALUES (%s,%s,'approved',%s,%s,now(),%s)
                    """,
                    (product_id, crop_ids[crop.casefold()], admin["id"], admin["id"], SOURCE_NOTE),
                )
            if product_id in changed_products:
                conn.execute(
                    "UPDATE products SET version=version+1,approved_by=%s,approved_at=now(),updated_at=now() WHERE id=%s",
                    (admin["id"], product_id),
                )
                conn.execute(
                    """
                    INSERT INTO audit_logs(id,actor_employee_id,action,entity_type,entity_key,previous_data,new_data)
                    VALUES (%s,%s,'replace_approved_crop_map','product',%s,%s::jsonb,%s::jsonb)
                    """,
                    (
                        uuid.uuid4(), admin["id"], product_id,
                        json.dumps({"approved_crops": old_mappings[product_id]}),
                        json.dumps({"approved_crops": crop_list, "source": SOURCE_NOTE}),
                    ),
                )

        provenance = {
            "applied_by": ADMIN_EMPLOYEE_CODE,
            "employee_source_sha256": args.email_source_sha256 or None,
            "product_source_sha256": args.product_source_sha256 or None,
            "product_json_sha256": sha256(args.products),
            "approved_product_crop_links": link_count,
            "email_rows_reviewed": len(email_updates),
            "email_changes": len(changed_emails),
        }
        conn.execute(
            """
            INSERT INTO app_settings(key,value,updated_by,updated_at)
            VALUES ('authoritative_master_update',%s::jsonb,%s,now())
            ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()
            """,
            (json.dumps(provenance), admin["id"]),
        )
        conn.commit()


if __name__ == "__main__":
    main()
