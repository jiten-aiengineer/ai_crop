import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

cmd = """
cd /home/ubuntu/apps/ai_crop && sudo docker compose exec -T db psql -U crop_life -d crop_life_ai -c "SELECT id, mobile_number, role, name, last_name, is_verified, verified_dealer_id FROM farmers WHERE mobile_number LIKE '%1234567891%';"
"""
stdin, stdout, stderr = client.exec_command(cmd)
print("FARMERS:")
print(stdout.read().decode())
print(stderr.read().decode())

cmd2 = """
cd /home/ubuntu/apps/ai_crop && sudo docker compose exec -T db psql -U crop_life -d crop_life_ai -c "SELECT id, dealer_code, portal_mobile_number, contact_number, status, name FROM dealers WHERE contact_number LIKE '%1234567891%' OR portal_mobile_number LIKE '%1234567891%';"
"""
stdin, stdout, stderr = client.exec_command(cmd2)
print("DEALERS:")
print(stdout.read().decode())
print(stderr.read().decode())

client.close()
