import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

sftp = client.open_sftp()
sftp.put("backend/app/farmer_auth.py", "/home/ubuntu/apps/ai_crop/backend/app/farmer_auth.py")
sftp.close()

stdin, stdout, stderr = client.exec_command("cd /home/ubuntu/apps/ai_crop && sudo docker compose up --build -d api")
print("WAITING FOR RESTART...")
print(stdout.read().decode())
print(stderr.read().decode())

client.close()
