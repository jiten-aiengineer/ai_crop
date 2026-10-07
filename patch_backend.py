import paramiko
import sys

try:
    key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

    sftp = client.open_sftp()
    sftp.put("backend/app/farmer_auth.py", "/home/ubuntu/apps/ai_crop/backend/app/farmer_auth.py")
    sftp.close()

    stdin, stdout, stderr = client.exec_command("sudo docker restart crop-life-ai-api-1")
    print("RESTART OUT:", stdout.read().decode())
    print("RESTART ERR:", stderr.read().decode())

    client.close()
    print("Done!")
except Exception as e:
    print(f"Error: {e}")
