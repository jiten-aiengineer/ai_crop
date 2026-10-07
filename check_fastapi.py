import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

stdin, stdout, stderr = client.exec_command("curl -s -i http://127.0.0.1:8000/api/v1/public/auth/me/rewards")
print(stdout.read().decode())
print(stderr.read().decode())

client.close()
