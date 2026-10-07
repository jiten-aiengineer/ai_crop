import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

cmd = """
cd /home/ubuntu/apps/ai_crop/backend/database/migrations
for file in *.sql; do
    if head -c 2 "$file" | grep -q $'\xff\xfe'; then
        echo "Converting $file to utf-8"
        iconv -f UTF-16LE -t UTF-8 "$file" -o "$file.tmp"
        mv "$file.tmp" "$file"
    fi
done
"""

stdin, stdout, stderr = client.exec_command(cmd)
print("CONVERT:", stdout.read().decode())
print("CONVERT ERR:", stderr.read().decode())

stdin, stdout, stderr = client.exec_command("cd /home/ubuntu/apps/ai_crop && sudo docker compose build api && sudo docker compose up -d api")
print("BUILD:", stdout.read().decode())
print("BUILD ERR:", stderr.read().decode())

client.close()
