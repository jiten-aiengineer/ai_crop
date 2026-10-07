import codecs

paths = [
    "backend/database/migrations/038_farmer_land_size.sql",
    "backend/database/migrations/037_employee_referrals.sql"
]
for path in paths:
    try:
        with open(path, "rb") as f:
            content = f.read()
        
        if content.startswith(b'\xff\xfe'):
            text = content.decode('utf-16')
        else:
            text = content.decode('utf-8', errors='replace')
        
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Fixed encoding for {path}")
    except Exception as e:
        print(e)
