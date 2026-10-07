import urllib.request
import json

req = urllib.request.Request(
    "https://ai.croplifescience.com/api/auth/me",
    headers={"User-Agent": "Mozilla/5.0"}
)
try:
    with urllib.request.urlopen(req) as response:
        print(response.status)
except Exception as e:
    print(e)
