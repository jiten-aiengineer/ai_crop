import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

# Step 1: Run migration 039 via python inside container
migration_sql = open("backend/database/migrations/039_farmer_rewards.sql").read()

migrate_script = f"""
import sys
sys.path.append("/app")
from app.db import connection

sql = '''{migration_sql}'''

with connection() as conn:
    # Execute each statement split by our delimiter
    statements = [s.strip() for s in sql.split('-- migrate:split') if s.strip()]
    for stmt in statements:
        try:
            conn.execute(stmt)
        except Exception as e:
            if 'already exists' in str(e) or 'duplicate' in str(e).lower():
                pass  # Idempotent
            else:
                raise
    conn.commit()
print("Migration 039 complete!")
"""

sftp = client.open_sftp()
# Upload migration script
with sftp.open("/home/ubuntu/migrate039.py", "w") as f:
    f.write(migrate_script)
# Upload updated farmer_auth.py
sftp.put("backend/app/farmer_auth.py", "/home/ubuntu/apps/ai_crop/backend/app/farmer_auth.py")
sftp.close()

# Run migration
stdin, stdout, stderr = client.exec_command("cat /home/ubuntu/migrate039.py | sudo docker exec -i crop-life-ai-api-1 python")
print("MIGRATE OUT:", stdout.read().decode())
print("MIGRATE ERR:", stderr.read().decode())

# Restart backend
stdin, stdout, stderr = client.exec_command("sudo docker restart crop-life-ai-api-1")
print("RESTART:", stdout.read().decode())

client.close()
print("Done!")
