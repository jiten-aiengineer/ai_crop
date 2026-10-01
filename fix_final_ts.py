import re

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
# fix {} error
c = c.replace("finalFirst = data.user.first_name || finalFirst;", "finalFirst = (data.user as any).first_name || finalFirst;")
# fix duplicated stepTitle stepSubtitle
c = c.replace("  stepTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },\n  stepSubtitle: { fontSize: 14, color: T.textSub, marginBottom: 24 },", "")
with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)


with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
# fix duplicated modalOverlay, modalContent, modalHeader, modalTitle, modalText, modalActionBtn
# The second block looks like:
#   modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
# Let's just remove the block from modalOverlay to the end of styles and add '});' back.
idx = c.find("  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)'")
if idx != -1:
    # Just cut off there and close it
    c = c[:idx] + "});\n"
with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)


with open('mobile/src/screens/sales_officer/SalesOfficerHomeScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("user?.name", "user?.first_name")
with open('mobile/src/screens/sales_officer/SalesOfficerHomeScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Final TS fix applied")
