import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

stdin, stdout, stderr = client.exec_command("cd /home/ubuntu/apps/ai_crop/frontend && npm run build > build.log 2>&1 && sudo systemctl restart crop-life-ai.service")

# wait for command to complete
exit_status = stdout.channel.recv_exit_status()
print("Exit status:", exit_status)

client.close()
