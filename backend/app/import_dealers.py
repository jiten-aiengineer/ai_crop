import csv
from pathlib import Path
from app.db import connection

def import_dealers():
    csv_path = Path(__file__).parent / "data" / "dealers.csv"
    
    if not csv_path.exists():
        print(f"File not found: {csv_path}")
        return

    print("Importing dealers from CSV...")
    success_count = 0
    error_count = 0

    with connection() as conn:
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
                    with conn.transaction():
                        conn.execute(
                            """
                            INSERT INTO dealers (
                                dealer_code, name, sales_executive, sales_area, sales_region, sales_territory, state, status
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s, %s, 'active'
                            ) ON CONFLICT (dealer_code) DO UPDATE SET
                                name = EXCLUDED.name,
                                sales_executive = EXCLUDED.sales_executive,
                                sales_area = EXCLUDED.sales_area,
                                sales_region = EXCLUDED.sales_region,
                                sales_territory = EXCLUDED.sales_territory,
                                state = EXCLUDED.state,
                                status = 'active'
                            """,
                            (dealer_code, name, sales_exec, sales_area, sales_region, sales_territory, state)
                        )
                    success_count += 1
                except Exception as e:
                    print(f"Error inserting {dealer_code}: {e}")
        
        conn.commit()

    print(f"Import complete! Successfully imported {success_count} dealers. Errors: {error_count}")

if __name__ == "__main__":
    import_dealers()
