import sys

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    login_content = f.read()

styles_to_add = '''
  stepContainer: { paddingVertical: 20 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },
  stepSubtitle: { fontSize: 14, color: T.textSub, marginBottom: 24 },
  mobileInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 12, overflow: 'hidden' },
  countryCodeBox: { backgroundColor: T.primaryLight, paddingHorizontal: 16, height: 56, justifyContent: 'center', borderRightWidth: 1, borderRightColor: T.border },
  countryCodeText: { fontSize: 16, fontWeight: '700', color: T.primary },
  mobileInput: { flex: 1, height: 56, fontSize: 18, fontWeight: '700', paddingHorizontal: 16, color: T.text },
'''

if "stepContainer:" not in login_content:
    idx = login_content.find("  progressSegActive:")
    if idx != -1:
        end_of_line = login_content.find("\\n", idx) + 1
        login_content = login_content[:end_of_line] + styles_to_add + login_content[end_of_line:]

# Fix verified.user properties casting
login_content = login_content.replace("let finalLast = verified.user.last_name || lastName;", "let finalLast = (verified.user as any).last_name || lastName;")
login_content = login_content.replace("let finalDistrict = verified.user.district || (place ? place.district : null);", "let finalDistrict = (verified.user as any).district || (place ? place.district : null);")
login_content = login_content.replace("let finalState = verified.user.state || (place ? place.state : null);", "let finalState = (verified.user as any).state || (place ? place.state : null);")
login_content = login_content.replace("let verifiedDealerId = verified.user.verified_dealer_id || null;", "let verifiedDealerId = (verified.user as any).verified_dealer_id || null;")

login_content = login_content.replace(
    "verified_dealer_id: verifiedDealerId",
    "// @ts-ignore\\n        verified_dealer_id: verifiedDealerId"
)

# Fix Step type
login_content = login_content.replace(
    "type Step = 'language' | 'phone' | 'dealer_code' | 'details' | 'otp';",
    "type Step = 'language' | 'phone' | 'dealer_code' | 'account' | 'details' | 'otp';"
)

import re
# Fix multiple dealerCode state variables if they exist
login_content = re.sub(r"(const \[dealerCode, setDealerCode\] = useState\(''\);.*){2,}", r"const [dealerCode, setDealerCode] = useState('');", login_content, flags=re.DOTALL)


with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(login_content)

print("Styles patched")
