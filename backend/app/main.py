from fastapi import FastAPI, Query

from .db import connection


app = FastAPI(title="Crop Life AI API", version="0.1.0")


@app.get("/health")
def health():
    with connection() as conn:
        row = conn.execute("SELECT current_database() AS database").fetchone()
    return {"status": "ok", "database": row["database"]}


@app.get("/api/v1/catalog/products")
def list_products(
    search: str = Query(default="", max_length=120),
    category: str = Query(default="", max_length=80),
    limit: int = Query(default=50, ge=1, le=100),
):
    filters = ["p.status = 'active'"]
    params: list[object] = []
    if search.strip():
        params.append(f"%{search.strip()}%")
        filters.append(
            "(p.name ILIKE %s OR p.common_name ILIKE %s OR p.use_benefits ILIKE %s)"
        )
        params.extend([params[-1], params[-1]])
    if category.strip():
        params.append(category.strip())
        filters.append("pc.name = %s")
    params.append(limit)
    sql = f"""
        SELECT p.id, p.name, pc.name AS category, p.common_name, p.dose,
               p.use_benefits, p.packing, p.image_path, p.source_page,
               p.approval_status
        FROM products p
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE {' AND '.join(filters)}
        ORDER BY p.name
        LIMIT %s
    """
    with connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"items": rows, "count": len(rows)}
