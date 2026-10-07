import requests

BASE_URL = "https://ai.croplifescience.com/api/v1/public/auth"

# 1. Send OTP
print("Sending OTP...")
res1 = requests.post(f"{BASE_URL}/send-otp", json={"mobile_number": "+919999999999", "is_new": True})
print(res1.status_code, res1.text)

# 2. Verify with wrong OTP
print("\nVerifying OTP...")
res2 = requests.post(f"{BASE_URL}/verify-otp", json={"mobile_number": "+919999999999", "otp": "000000"})
print(res2.status_code, res2.text)
