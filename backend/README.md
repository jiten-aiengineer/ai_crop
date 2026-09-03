# Crop Life AI database foundation

This directory contains the first PostgreSQL-backed production foundation for
employees, Microsoft identities, roles, products, approval workflows and
approved crop/problem mappings.

The operational schema also includes organizational hierarchy, inspections,
S3 image metadata, multi-model AI predictions, expert verification,
recommendations shown to employees, weather snapshots and AI usage/cost logs.

## Local startup

Docker Desktop must be running with Linux-container support.

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:8000/health
```

The API startup applies versioned SQL migrations and imports the 73 products
from `app/data/products.json`.

The project database is exposed on host port `5434` because this development
PC already has native PostgreSQL services on ports `5432` and `5433`. Containers
still communicate with the database on the normal internal port `5432`.

## Employee import

The source employee workbook is deliberately not committed to Git. A normalized
CSV is written to `backend/private-import/employees.csv`, which is ignored by
Git, and imported with:

```powershell
docker compose run --rm api python -m app.import_employees /imports/employees.csv
docker compose run --rm api python -m app.import_catalog_knowledge app/data/products.json
```

`CLSL-1415` is assigned the supplied Microsoft email and receives the initial
administrator, manager and sole-approver roles. Other employees receive only the
field-employee role; records without a company email remain pending.

The catalogue-knowledge importer creates only crop and problem mappings that are
explicitly supported by wording in the supplied CLSL catalogue data. It does not
invent registrations, doses, or recommendations from external sources.

## Production notes

- Replace the local database password before any shared deployment.
- Microsoft Entra sign-in will bind the verified tenant/user subject to the
  pre-imported employee record.
- Product crop/problem mappings remain pending until approved.
- Inspection images are retained until the replacement model is trained,
  validated and operational; the policy is then reviewed explicitly.
