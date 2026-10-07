import requests
import json

base_url = "https://ai.croplifescience.com/api/v1/public/auth"

# 1. Send OTP
print("Sending OTP...")
res = requests.post(f"{base_url}/send-otp", json={"mobile_number": "+919876543210", "is_new": True})
print(res.status_code, res.text)

# 2. Get OTP from DB using local backend connection? 
# Wait, I can't read the OTP from the LIVE database!
# The LIVE database is on the EC2 server and I don't have access.
