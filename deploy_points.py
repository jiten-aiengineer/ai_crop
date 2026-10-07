import paramiko

key = paramiko.RSAKey.from_private_key_file(".deploy-key-temp.pem")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname="44.213.218.185", username="ubuntu", pkey=key)

give_points_script = """
import sys
sys.path.append("/app")
from app.db import connection

with connection() as conn:
    farmers = conn.execute("SELECT id FROM farmers").fetchall()
    count = 0
    for f in farmers:
        # Give 20 points
        conn.execute("UPDATE farmers SET rewards_points = COALESCE(rewards_points, 0) + 20 WHERE id = %s", (f['id'],))
        conn.execute("INSERT INTO farmer_reward_activities(farmer_id, activity_type, points, description) VALUES(%s, 'manual_credit', 20, 'Welcome Bonus Points')", (f['id'],))
        count += 1
    conn.commit()
    print(f"Updated {count} farmers with 20 bonus points!")
"""

sftp = client.open_sftp()
with sftp.open("/home/ubuntu/give_points.py", "w") as f:
    f.write(give_points_script)
sftp.put("backend/app/farmer_auth.py", "/home/ubuntu/apps/ai_crop/backend/app/farmer_auth.py")
sftp.close()

stdin, stdout, stderr = client.exec_command("cat /home/ubuntu/give_points.py | sudo docker exec -i crop-life-ai-api-1 python")
print("POINTS OUT:", stdout.read().decode())
print("POINTS ERR:", stderr.read().decode())

stdin, stdout, stderr = client.exec_command("sudo docker restart crop-life-ai-api-1")
print("RESTART OUT:", stdout.read().decode())

client.close()
print("Done!")
