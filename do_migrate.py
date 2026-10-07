import paramiko

key = paramiko.RSAKey.from_private_key_file('.deploy-key-temp.pem')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname='44.213.218.185', username='ubuntu', pkey=key)

script = """import sys
import os
sys.path.append("/srv/backend")
try:
    from app.db import connection
except ImportError:
    sys.path.append("/app")
    from app.db import connection

with connection() as conn:
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS state VARCHAR(120)')
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS city VARCHAR(120)')
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS territory VARCHAR(160)')
    conn.execute('ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32)')
    conn.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS hr_sync_state VARCHAR(32) DEFAULT 'existing'")
    conn.execute('''CREATE TABLE IF NOT EXISTS portal_password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval \'1 hour\',
    used_at TIMESTAMPTZ,
    UNIQUE (token_hash)
)''')
    conn.execute('''CREATE INDEX IF NOT EXISTS portal_password_reset_tokens_employee_idx
    ON portal_password_reset_tokens(employee_id)''')
    conn.commit()
print("Migration 040 done.")
"""

with open('temp_migrate_db.py', 'w') as f:
    f.write(script)

sftp = client.open_sftp()
sftp.put('temp_migrate_db.py', '/home/ubuntu/apps/ai_crop/temp_migrate_db.py')
sftp.close()

stdin, stdout, stderr = client.exec_command('cd /home/ubuntu/apps/ai_crop && cat temp_migrate_db.py | sudo docker compose exec -T api python3')
print(stdout.read().decode())
print(stderr.read().decode())
client.close()
