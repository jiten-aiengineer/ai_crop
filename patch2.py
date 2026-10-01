import sys

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix STEP_ORDER to include 'account'
content = content.replace(
    "const STEP_ORDER: Step[] = ['language', 'phone', 'dealer_code', 'details', 'otp'];",
    "const STEP_ORDER: Step[] = ['language', 'phone', 'dealer_code', 'account', 'details', 'otp'];"
)
content = content.replace(
    "type Step = 'language' | 'phone' | 'dealer_code' | 'details' | 'otp';",
    "type Step = 'language' | 'phone' | 'dealer_code' | 'account' | 'details' | 'otp';"
)

# Update continueFromPhone to point to 'account' for new user
content = content.replace("setStep('details'); // Collect name, state, etc.", "setStep('account');")

# In renderAccount, remove mobile input
idx = content.find("<View style={s.mobileInputContainer}>")
# wait, the mobile input was inside renderAccount.
# I already moved it to renderPhone. Let's see if renderAccount still has a mobile input.
