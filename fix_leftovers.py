import re

# LoginScreen
with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Remove continueFromDetails
c = re.sub(r"const continueFromDetails = async \(\) => \{.*?\n  \};", "", c, flags=re.DOTALL)

# 2. Fix empty string assignment error
c = c.replace("...(isDealerUI && dealerCode ? { dealer_code: dealerCode } : {}),", "")

# 3. Remove progressSegActive duplicates
c = re.sub(r"(  progressSegActive: \{ backgroundColor: T.primary \},\n+)+", "  progressSegActive: { backgroundColor: T.primary },\n", c)

# 4. Fix TS error about Type '{}' is not assignable to type 'string' (data?.user?.first_name assignment)
# Oh wait, that is at line 346: irst_name: (data?.user?.first_name as string) || firstName,? No, wait. 
# Ah, I see isDealerUI && dealerCode ? { dealer_code: dealerCode } : {} on line 312. Wait, line 309 says irst_name doesn't exist. That means line 309 is INSIDE continueFromDetails. Since I removed continueFromDetails, line 309 error is gone.
# But what is line 346? Let me check line 346.

with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

# DealerHomeScreen
with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r"(  listCard: \{[^\}]+\},\n  listIcon: \{[^\}]+\},\n  listTitle: \{[^\}]+\},\n  listSub: \{[^\}]+\},)", "", c, count=1)

with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

# SalesOfficerHomeScreen
with open('mobile/src/screens/sales_officer/SalesOfficerHomeScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace("user.name", "user.first_name")

with open('mobile/src/screens/sales_officer/SalesOfficerHomeScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Ran fix")
