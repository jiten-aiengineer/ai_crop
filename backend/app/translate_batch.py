import json
import time
import requests
import urllib.parse

en_text = {
  "welcomeTitle": "Welcome!",
  "welcomeSub": "I am your smart crop doctor, ready to help.",
  "welcome": "Welcome to CLSL AI",
  "choose": "Choose your language",
  "account": "Join CLSL AI",
  "intro": "Unlock AI crop care, weather, products, rewards, and offers.",
  "firstName": "First name",
  "lastName": "Last name",
  "mobile": "Mobile number",
  "details": "Complete your login",
  "farmer": "Farmer",
  "dealer": "CLSL Dealer",
  "farmerBenefitTitle": "CLSL Farmer Benefits",
  "farmerBenefitText": "Farmers get offers and coupons on CLSL products. Get a referral code from your nearest CLSL dealer.",
  "dealerRecognised": "Dealer Mobile Recognised",
  "dealerRecognisedHelp": "Enter your CLSL dealer code to verify dealership.",
  "dealerCode": "Dealer Code",
  "referralCode": "Dealer Referral Code",
  "scanQr": "Scan Referral QR",
  "orEnterCode": "Or enter 7-letter code",
  "verify": "Verify",
  "verified": "Verified",
  "confirmDealer": "Confirm Dealership Details",
  "dealerConfirmed": "✓ Details verified",
  "otpButton": "Continue with OTP",
  "otpTitle": "Verify Mobile",
  "otpHelp": "TEST MODE: Enter 123456.",
  "otp": "6-digit OTP",
  "enter": "Enter CLSL AI",
  "back": "Back",
  "continue": "Continue",
  "wait": "Please wait...",
  "required": "Complete required fields.",
  "test": "Test login",
  "cityTerritory": "City / Territory",
  "owner": "Owner",
  "registeredMobile": "Registered Mobile",
  "mobileWarning": "This dealership is registered to another number.",
  "selectOne": "Select one",
  "requiredField": "Required"
}

# Added 'mr' (Marathi), 'gu' (Gujarati), 'bn' (Bengali)
langs = ['ar', 'ne', 'vi', 'am', 'ms', 'my', 'fa', 'sw', 'tl', 'zh-CN', 'es', 'fr', 'de', 'ru', 'pt', 'ja', 'ko', 'it', 'or', 'as', 'ur', 'pa', 'mr', 'gu', 'bn']

all_translations = {}

def translate_text(text, target_lang):
    # MyMemory Free Public Endpoints (No Key Required)
    # Handling zh-CN mapping if needed, MyMemory uses 'zh' usually for Chinese
    lang_code = 'zh' if target_lang == 'zh-CN' else target_lang
    url = f"https://api.mymemory.translated.net/get?q={urllib.parse.quote(text)}&langpair=en|{lang_code}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        return data.get("responseData", {}).get("translatedText")
    except Exception as e:
        print(f"Error translating to {target_lang}: {e}")
        return None

print("Starting translation download using MyMemory...")
for lang in langs:
    print(f"Translating to {lang}...")
    translated_obj = {}
    
    # We process each key individually
    success = True
    for key, value in en_text.items():
        result = translate_text(value, lang)
        if result:
            translated_obj[key] = result
        else:
            success = False
            translated_obj[key] = value # fallback to English
            print(f"Failed translation for '{key}' in {lang}")
        
        # Minor 1-second pause between translations to respect the free API limits
        time.sleep(1)
    
    output_lang = 'zh' if lang == 'zh-CN' else lang
    all_translations[output_lang] = translated_obj
    
    if success:
        print(f"Success {lang}")
    else:
        print(f"Completed {lang} with some errors (used fallback)")

out_path = r'c:\Users\Asus\Documents\Codex\2026-08-27\hi\work\crop-life-ai\backend\app\i18n_login.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(all_translations, f, ensure_ascii=False, indent=2)

print("Saved all translations to", out_path)
