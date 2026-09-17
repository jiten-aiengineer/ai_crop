import asyncio
import csv
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.config import settings

async def import_dealers():
    # Setup database connection
    engine = create_async_engine(settings.DATABASE_URL)
    
    csv_path = Path(__file__).parent.parent / "app" / "data" / "dealers.csv"
    
    if not csv_path.exists():
        print(f"File not found: {csv_path}")
        return

    print("Importing dealers from CSV...")
    success_count = 0
    error_count = 0

    async with engine.begin() as conn:
        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                dealer_code = row.get("Code", "").strip()
                name = row.get("Name", "").strip()
                sales_exec = row.get("Sales Executive", "").strip()
                sales_area = row.get("Sales Area", "").strip()
                sales_region = row.get("Sales Region", "").strip()
                sales_territory = row.get("Sales Territory", "").strip()
                state = row.get("State", "").strip()

                if not dealer_code:
                    continue

                try:
                    await conn.execute(
                        text("""
                        INSERT INTO dealers (
                            dealer_code, name, sales_executive, sales_area, sales_region, sales_territory, state, is_active
                        ) VALUES (
                            :code, :name, :exec, :area, :region, :territory, :state, true
                        ) ON CONFLICT (dealer_code) DO UPDATE SET
                            name = EXCLUDED.name,
                            sales_executive = EXCLUDED.sales_executive,
                            sales_area = EXCLUDED.sales_area,
                            sales_region = EXCLUDED.sales_region,
                            sales_territory = EXCLUDED.sales_territory,
                            state = EXCLUDED.state,
                            is_active = true
                        """),
                        {
                            "code": dealer_code,
                            "name": name,
                            "exec": sales_exec,
                            "area": sales_area,
                            "region": sales_region,
                            "territory": sales_territory,
                            "state": state
                        }
                    )
                    success_count += 1
                except Exception as e:
                    print(f"Error inserting {dealer_code}: {e}")
                    error_count += 1

    print(f"Import complete! Successfully imported {success_count} dealers. Errors: {error_count}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(import_dealers())
