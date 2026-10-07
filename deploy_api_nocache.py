import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

stdin, stdout, stderr = client.exec_command("cd /home/ubuntu/apps/ai_crop && sudo docker compose build --no-cache api && sudo docker compose up -d api")
print("BUILD NO CACHE OUT:", stdout.read().decode())
print("BUILD NO CACHE ERR:", stderr.read().decode())

client.close()
