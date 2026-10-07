import requests
import json

base_url = "http://192.168.29.91:8000"

mobile = "+91656565656565"

# 1. Send OTP
print("Sending OTP...")
res = requests.post(f"{base_url}/auth/send-otp", json={
    "mobile_number": mobile,
    "is_new": True
})
print("Send OTP Response:", res.status_code, res.text)

# 2. Verify OTP
print("Verifying OTP...")
res = requests.post(f"{base_url}/auth/verify-otp", json={
    "mobile_number": mobile,
    "otp": "123456"
})
print("Verify OTP Response:", res.status_code, res.text)

if res.status_code == 200:
    data = res.json()
    token = data["session_token"]
    
    # 3. Update Profile
    print("Updating Profile...")
    profile_payload = {
        "role": "farmer",
        "first_name": "Test",
        "last_name": "User",
        "preferred_language": "en",
        "date_of_birth": "24/09/1990",
        "district": "Ahmedabad",
        "state": "Gujarat",
        "city": "Ahmedabad",
        "social_media_used": ["WhatsApp"],
        "acquisition_source": "Friend",
        "land_size": 63,
        "referral_code": "7MJMF8A",
        "dealer_code": None,
        "location_latitude": 23.0225,
        "location_longitude": 72.5714,
        "location_label": "Ahmedabad, Gujarat",
        "location_consent": True
    }
    res = requests.post(f"{base_url}/auth/profile", json=profile_payload, headers={
        "Authorization": f"Bearer {token}"
    })
    print("Update Profile Response:", res.status_code, res.text)
