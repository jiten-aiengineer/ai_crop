import requests
import json

url = "https://ai.croplifescience.com/api/auth/verify-otp"
payload = {
    "mobile_number": "+916565656565",
    "otp": "123456"
}
headers = {
    "Content-Type": "application/json"
}

try:
    response = requests.post(url, json=payload)
    print("Status Code:", response.status_code)
    print("Response Text:", response.text)
except Exception as e:
    print("Error:", e)
