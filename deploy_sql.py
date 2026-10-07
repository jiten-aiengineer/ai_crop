import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

sftp = client.open_sftp()
sftp.put("backend/database/migrations/039_farmer_rewards.sql", "/home/ubuntu/apps/ai_crop/backend/database/migrations/039_farmer_rewards.sql")
sftp.put("backend/database/migrations/038_farmer_land_size.sql", "/home/ubuntu/apps/ai_crop/backend/database/migrations/038_farmer_land_size.sql")
sftp.put("backend/database/migrations/037_employee_referrals.sql", "/home/ubuntu/apps/ai_crop/backend/database/migrations/037_employee_referrals.sql")
sftp.close()

stdin, stdout, stderr = client.exec_command("cd /home/ubuntu/apps/ai_crop && sudo docker compose build --no-cache api && sudo docker compose up -d api")
print("WAITING FOR BUILD...")
stdout.read()

client.close()
