import json
import re
import sys
import uuid
from pathlib import Path

from .db import connection


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main(path_value: str):
    source = Path(path_value)
    products = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(products, list):
        raise ValueError("Product import must contain a JSON array.")

    with connection() as conn:
        category_ids: dict[str, uuid.UUID] = {}
        for product in products:
            category_name = str(product["category"]).strip()
            category_id = uuid.uuid5(uuid.NAMESPACE_URL, f"clsl-category:{slug(category_name)}")
            conn.execute(
                """
                INSERT INTO product_categories(id, code, name)
                VALUES (%s, %s, %s)
                ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
                """,
                (category_id, slug(category_name), category_name),
            )
            category_ids[category_name] = category_id

        for product in products:
            conn.execute(
                """
                INSERT INTO products(
                    id, name, category_id, common_name, dose, use_benefits,
                    packing, image_path, source_page, status, approval_status,
                    catalogue_version
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                        'active', 'approved', 'CLSL English Catalogue 2023')
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    category_id = EXCLUDED.category_id,
                    common_name = EXCLUDED.common_name,
                    dose = EXCLUDED.dose,
                    use_benefits = EXCLUDED.use_benefits,
                    packing = EXCLUDED.packing,
                    image_path = EXCLUDED.image_path,
                    source_page = EXCLUDED.source_page,
                    catalogue_version = EXCLUDED.catalogue_version,
                    updated_at = now()
                """,
                (
                    str(product["id"]),
                    str(product["name"]).strip(),
                    category_ids[str(product["category"]).strip()],
                    str(product.get("commonName") or "").strip() or None,
                    str(product.get("dose") or "").strip() or None,
                    str(product.get("useBenefits") or "").strip() or None,
                    str(product.get("packing") or "").strip() or None,
                    str(product.get("image") or "").strip() or None,
                    int(product["sourcePage"]) if product.get("sourcePage") else None,
                ),
            )
        conn.commit()

        count = conn.execute("SELECT count(*) AS count FROM products").fetchone()["count"]
        categories = conn.execute(
            "SELECT count(*) AS count FROM product_categories"
        ).fetchone()["count"]
    print(f"Imported {count} products across {categories} categories.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.import_products /path/to/products.json")
    main(sys.argv[1])
