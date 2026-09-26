import random
import uuid
import sys
import psycopg

# Connect to the local docker Postgres (port 5434 outside, 5432 inside)
# Wait, this will be run inside docker so DB_HOST=db and DB_PORT=5432
# I'll just use psycopg.connect("postgresql://postgres:password123@db:5432/croplifeai")

STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
]

def generate_mobile():
    return "9" + "".join([str(random.randint(0, 9)) for _ in range(9)])

def main():
    try:
        conn = psycopg.connect("postgresql://crop_life:crop-life-local-only@db:5432/crop_life_ai")
    except Exception as e:
        print(f"Failed to connect to DB: {e}")
        sys.exit(1)

    cursor = conn.cursor()
    print("Seeding dummy dealers...")
    
    count = 0
    for state in STATES:
        for i in range(10):
            dealer_code = f"DLR-TEST-{state[:3].upper()}-{random.randint(1000, 9999)}"
            name = f"Test Dealership {i} - {state}"
            owner = f"Test Owner {i}"
            mobile = generate_mobile()
            
            try:
                cursor.execute("""
                    INSERT INTO dealers (id, dealer_code, name, owner_name, state, portal_mobile_number, status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'active')
                    ON CONFLICT (dealer_code) DO NOTHING
                """, (uuid.uuid4(), dealer_code, name, owner, state, mobile))
                count += 1
            except Exception as e:
                print(f"Error inserting dealer: {e}")
                
    conn.commit()
    conn.close()
    print(f"Successfully seeded {count} test dealers!")

if __name__ == "__main__":
    main()
