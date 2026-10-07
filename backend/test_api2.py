import requests
import json

url = "https://ai.croplifescience.com/api/auth/profile"
payload = {
    "role": "farmer",
    "first_name": "Test",
    "last_name": "Test",
    "preferred_language": "en",
    "date_of_birth": None,
    "district": "Test",
    "state": "Test",
    "city": None,
    "social_media_used": ["Facebook"],
    "acquisition_source": "Other",
    "location_latitude": 20.0,
    "location_longitude": 70.0,
    "location_label": "Test, Test",
    "location_consent": True
}
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer whatever"
}

try:
    response = requests.post(url, json=payload, headers=headers)
    print("Status Code:", response.status_code)
    print("Response Text:", response.text)
except Exception as e:
    print("Error:", e)
