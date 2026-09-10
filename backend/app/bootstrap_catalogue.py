"""Initialise the supplied catalogue only for a brand-new database.

The administration portal is the production source of truth after initial
setup. Re-importing the seed JSON on every API restart would silently overwrite
approved product details and crop mappings, so the seed runs only when no
product records exist yet.
"""

import sys

from .db import connection


def main(seed_path: str) -> None:
    with connection() as conn:
        existing = conn.execute("SELECT count(*) AS count FROM products").fetchone()["count"]
    if existing:
        print(f"Catalogue bootstrap skipped; preserving {existing} existing product records.")
        return

    from .import_products import main as import_products
    from .import_catalog_knowledge import main as import_catalogue_knowledge

    import_products(seed_path)
    import_catalogue_knowledge(seed_path)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.bootstrap_catalogue /path/to/products.json")
    main(sys.argv[1])
