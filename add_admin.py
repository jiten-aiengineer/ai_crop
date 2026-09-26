import os
import sys
import secrets
import hashlib
import base64
import psycopg

# os.environ["DATABASE_URL"] = "postgres://crop_life:crop-life-local-only@localhost:5434/crop_life_ai"

def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    return "scrypt$16384$8$1$%s$%s" % (
        base64.urlsafe_b64encode(salt).decode().rstrip("="),
        base64.urlsafe_b64encode(derived).decode().rstrip("="),
    )

def add_admin():
    email = "admin@croplifescience.com"
    password = "password123"
    p_hash = _password_hash(password)
    
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            # check if employee exists
            cur.execute("SELECT id FROM employees WHERE office_email = %s OR microsoft_upn = %s", (email, email))
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "INSERT INTO employees (full_name, office_email, status) VALUES (%s, %s, 'active') RETURNING id",
                    ("Jiten Advani", email)
                )
                emp_id = cur.fetchone()[0]
                # give super admin role
                cur.execute(
                    "INSERT INTO employee_roles (employee_id, role) VALUES (%s, 'super_admin')",
                    (emp_id,)
                )
            else:
                emp_id = row[0]

            # Upsert into portal_password_accounts
            cur.execute("""
                INSERT INTO portal_password_accounts (employee_id, email, password_hash, invited_by, active)
                VALUES (%s, %s, %s, %s, true)
                ON CONFLICT (employee_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true
            """, (emp_id, email, p_hash, emp_id))
            
            # Ensure email exists uniquely
            try:
                cur.execute("UPDATE portal_password_accounts SET email = %s WHERE employee_id = %s", (email, emp_id))
            except psycopg.errors.UniqueViolation:
                # If someone else has this email, delete them first
                cur.execute("DELETE FROM portal_password_accounts WHERE email = %s AND employee_id != %s", (email, emp_id))
                cur.execute("UPDATE portal_password_accounts SET email = %s WHERE employee_id = %s", (email, emp_id))

        conn.commit()
    print("Admin created/updated successfully with password: password123")

if __name__ == "__main__":
    add_admin()
