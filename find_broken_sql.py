import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

cmd = """
python3 -c "
import pathlib
p = pathlib.Path('/home/ubuntu/apps/ai_crop/backend/database/migrations')
for f in p.glob('*.sql'):
    try:
        f.read_text(encoding='utf-8')
    except Exception as e:
        print(f'Failed to read {f.name}: {e}')
"
"""

stdin, stdout, stderr = client.exec_command(cmd)
print("OUT:", stdout.read().decode())
print("ERR:", stderr.read().decode())

client.close()
