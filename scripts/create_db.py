import psycopg

# Connect to default postgres DB to create crop_life_ai
try:
    with psycopg.connect("dbname=postgres user=postgres password=postgres host=127.0.0.1 port=5432", autocommit=True) as conn:
        conn.execute("CREATE DATABASE crop_life_ai")
        print("Database created.")
except Exception as e:
    print(f"Error: {e}")
