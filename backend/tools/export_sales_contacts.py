"""Export a privacy-limited sales directory for the pilot web app.

Only active Sales & Marketing employees with a company email are exported.
Personal email, personal mobile, birth date, payroll details and employee IDs are
never included in the public directory.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app.db import connection  # noqa: E402


STATE_RULES = {
    "Gujarat": (
        "guj", "amreli", "botad", "deesa", "himmatnagar", "jamnagar",
        "junagadh", "nadiad", "rajkot", "surat", "surendranagar", "vadodara",
    ),
    "Maharashtra": (
        "m.h", "-mh", "maharashtra", "ahmednagar", "akola", "amravati",
        "beed", "chandrapur", "nanded", "nasik", "nashik", "pune",
        "sambhaji", "washim", "yawatmal",
    ),
    "Uttar Pradesh": (
        "u.p", "-up", "(up", "w.u.p", "aligarh", "allahabad", "azamgarh",
        "barabanki", "bareilly", "faizabad", "gorakhpur", "jhansi", "kannauj",
        "kanpur", "lucknow", "muzaffarnagar", "pilibhit", "rath", "shahjahanpur",
        "varanasi",
    ),
    "Madhya Pradesh": (
        "m.p", "-mp", "ashoknagar", "betul", "bhopal", "dewas", "dhamnod",
        "hoshangabad", "jabalpur", "ratlam", "sagar", "seoni", "shivpuri", "ujjain",
    ),
    "Chhattisgarh": (
        "c.g", "(cg", "-cg", "bilaspur", "dhamtari", "durg", "mungeli",
        "raipur", "saraipali",
    ),
    "West Bengal": (
        "w.b", "-wb", "(wb", "baharampur", "baruipur", "birbhum", "burdwan",
        "egra", "kolkata", "raigunj", "tarakeswar",
    ),
    "Bihar": (
        "bihar", "begusarari", "katihar", "motihari", "nasrigunj", "patna",
        "sasaram", "sitamarthi",
    ),
}


def infer_state(location: str) -> str:
    value = location.casefold()
    for state, markers in STATE_RULES.items():
        if any(marker in value for marker in markers):
            return state
    return "Other"


def clean_city(location: str) -> str:
    value = re.sub(r"\s*\([^)]*(?:M\.?H|M\.?P|U\.?P|W\.?B|C\.?G|CG|UP)[^)]*\)\s*", "", location, flags=re.I)
    value = re.sub(r"\s*[-–]\s*(?:Guj\.?|MH|MP|UP|WB|Bihar|Patna)\s*$", "", value, flags=re.I)
    return re.sub(r"\s+", " ", value).strip(" -.") or location


def public_phone(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return ""


def main(output_path: str) -> None:
    sql = """
        SELECT full_name, designation, location, office_email, office_mobile
        FROM employees
        WHERE status = 'active'
          AND department = 'Sales & Marketing'
          AND office_email IS NOT NULL
        ORDER BY location, full_name
    """
    with connection() as conn:
        rows = conn.execute(sql).fetchall()

    contacts = []
    for row in rows:
        location = (row["location"] or "").strip()
        if not location:
            continue
        contacts.append(
            {
                "name": row["full_name"].strip(),
                "designation": (row["designation"] or "Sales representative").strip(),
                "state": infer_state(location),
                "territory": location,
                "city": clean_city(location),
                "email": row["office_email"].strip().lower(),
                "phone": public_phone(row["office_mobile"]),
            }
        )

    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(contacts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(contacts)} active sales contacts to {target}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python export_sales_contacts.py OUTPUT.json")
    main(sys.argv[1])
