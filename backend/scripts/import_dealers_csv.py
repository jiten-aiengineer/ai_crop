import csv
import os
import sys

import sys
sys.path.insert(0, '/srv/backend')
from app.db import connection

csv_path = sys.argv[1]

with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    dealers = list(reader)

with connection() as conn:
    with conn.cursor() as cur:
        for d in dealers:
            cur.execute("""
                INSERT INTO dealers (dealer_code, name, sales_executive, sales_area, sales_region, sales_territory, state, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'active')
                ON CONFLICT (dealer_code) DO UPDATE SET
                    name = EXCLUDED.name,
                    sales_executive = EXCLUDED.sales_executive,
                    sales_area = EXCLUDED.sales_area,
                    sales_region = EXCLUDED.sales_region,
                    sales_territory = EXCLUDED.sales_territory,
                    state = EXCLUDED.state
            """, (
                d['Code'],
                d['Name'],
                d['Sales Executive'],
                d['Sales Area'],
                d['Sales Region'],
                d['Sales Territory'],
                d['State']
            ))
        conn.commit()
print(f"Imported {len(dealers)} dealers.")
