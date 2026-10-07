import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

stdin, stdout, stderr = client.exec_command("sudo systemctl list-units | grep crop")
print(stdout.read().decode())

client.close()
