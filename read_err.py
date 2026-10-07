import urllib.request
from urllib.error import HTTPError

try:
    urllib.request.urlopen(urllib.request.Request('https://ai.croplifescience.com/api/auth/me/rewards', headers={'User-Agent': 'Mozilla'}))
except HTTPError as e:
    print(e.code)
    print(e.read().decode())
