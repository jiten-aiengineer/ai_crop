import re

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace startOtp
c = re.sub(r"const startOtp = async \(\) => \{.*?\n  \};", "", c, flags=re.DOTALL)

with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Removed startOtp")
