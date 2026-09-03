import hashlib
from pathlib import Path

import psycopg

from .config import DATABASE_URL


MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "database" / "migrations"
SPLIT_MARKER = "-- migrate:split"


def main():
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                checksum TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.commit()

        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            sql = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(sql.encode("utf-8")).hexdigest()
            existing = conn.execute(
                "SELECT checksum FROM schema_migrations WHERE version = %s",
                (path.name,),
            ).fetchone()
            if existing:
                if existing[0] != checksum:
                    raise RuntimeError(f"Applied migration changed: {path.name}")
                continue

            with conn.transaction():
                for statement in sql.split(SPLIT_MARKER):
                    if statement.strip():
                        conn.execute(statement)
                conn.execute(
                    "INSERT INTO schema_migrations(version, checksum) VALUES (%s, %s)",
                    (path.name, checksum),
                )
            print(f"Applied {path.name}")


if __name__ == "__main__":
    main()
